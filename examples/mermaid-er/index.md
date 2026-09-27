---
format: visser/1
docId: 798bf1cc-2e92-4df6-ad9a-190434de6749
title: An invoice line belongs to exactly one invoice and one product
kind: reference
capturedAt: 2026-09-27T00:00:00Z
reader:
  profile: experienced-systems-engineer
  knows: [relational schemas]
  new: [this illustrative billing schema]
  mustUnderstand: [which rows can exist alone, where totals come from]
visibility: private
---

<!-- vs:id bill_overview -->
# An invoice line belongs to exactly one invoice and one product

<!-- vs:id bill_claim -->
Invoice totals are not stored; they are the sum of the invoice's lines. Each
line refers to one product. If a line read the product's current price, a price
change would silently alter old invoices, so each line must store the unit
price it was billed at.

<!-- vs:id bill_limits -->
This is an illustrative schema. The diagram is shown as one figure: its
entities and relationships are not individually inspectable, and the source
text below the drawing states them exactly.

{% mermaid id="bill_schema" title="Lines connect invoices to products" question="Which entities can exist without the others?" %}
A customer can exist without invoices, and a product without invoice lines; an
invoice line cannot exist without both.

```mermaid
erDiagram
  CUSTOMER ||--o{ INVOICE : "is billed by"
  INVOICE ||--|{ INVOICE_LINE : contains
  PRODUCT ||--o{ INVOICE_LINE : "appears on"
  INVOICE {
    string number PK
    date issued_on
    string customer_id FK
  }
```
{% /mermaid %}
