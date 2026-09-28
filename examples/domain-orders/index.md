---
format: visser/1
docId: 6a76097f-db7d-4fc4-9188-f5d4ed536bc2
title: "An order has invoice lines; each line bills one product"
kind: reference
capturedAt: 2026-09-28T12:36:17Z
reader:
  profile: experienced-systems-engineer
  knows: [relational schemas]
  new: [invoice line]
  mustUnderstand:
    - "which thing owns an invoice line"
    - "where a line gets its price"
visibility: private
---

<!-- vs:id overview -->
# An order has invoice lines; each line bills one product

<!-- vs:id claim -->
Billing uses four words: customer, order, invoice line, and product. Each
invoice line stores the unit price that the customer paid. A later change to
the product price does not change an old invoice.

{% definition id="def_customer" term="customer" aliases=["customers"] %}
A customer is a person or a company that places orders and pays invoices.
The billing address belongs to the customer, not to the order.
{% /definition %}

{% definition id="def_order" term="order" aliases=["orders"] %}
An order is one request from a customer to buy one or more products.
An order is open until billing closes it.
{% /definition %}

{% definition id="def_line" term="invoice line" aliases=["invoice lines", "line", "lines"] %}
An invoice line bills one product of an order, with a quantity and the unit price of that day.
Billing never recalculates a line after it closes the order.
{% /definition %}

{% definition id="def_product" term="product" aliases=["products"] %}
A product is one item in the catalogue, with a current list price.
{% /definition %}

{% domain id="billing_terms" title="An order has invoice lines" question="Which things does billing talk about, what does each mean, and how do they relate?" %}
Read this once. The map below uses the same words.

{% concept id="c_customer" label="Customer" definition="def_customer" category="actor" attributes=["billing address"] /%}
{% concept id="c_order" label="Order" definition="def_order" category="thing" attributes=["id", "state"] entity="n_order" /%}
{% concept id="c_line" label="Invoice line" definition="def_line" category="thing" attributes=["quantity", "unit price"] /%}
{% concept id="c_product" label="Product" definition="def_product" category="thing" attributes=["list price"] /%}

{% relation id="r_places" from="c_customer" to="c_order" kind="produces" label="places" /%}
{% relation id="r_lines" from="c_order" to="c_line" kind="has" label="contains" cardinality="1..*" %}
An order with no lines cannot close.
{% /relation %}
{% relation id="r_bills" from="c_line" to="c_product" kind="identifies" label="bills" cardinality="1" %}
The line copies the list price when billing closes the order.
{% /relation %}
{% /domain %}

<!-- vs:id where_order -->
The checkout service owns each order. The order is the only concept in this
example that a service stores as one record.

{% graph id="billing_map" mode="architecture" title="Checkout owns each record" question="Which part keeps the record, and which part keeps the copy?" %}
Arrows are ownership and data, not execution order.

{% node id="n_api" label="Checkout service" role="interface" %}
Takes the order from the customer and closes it.
{% /node %}

{% node id="n_order" label="Order" role="concept" %}
One record per order, with its lines.
{% /node %}

{% node id="n_invoices" label="Invoice store" role="storage" %}
Keeps each closed order as an invoice.
{% /node %}

{% edge id="e_owns" from="n_api" to="n_order" kind="owns" label="creates and closes" /%}
{% edge id="e_writes" from="n_order" to="n_invoices" kind="data" label="copied at close" /%}
{% /graph %}
