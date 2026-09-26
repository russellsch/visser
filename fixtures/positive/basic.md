---
format: explain/1
docId: 4f8ac70c-7e14-4f06-9865-e194f57c7239
title: Fixture
kind: teaching
capturedAt: 2026-09-26T00:00:00Z
visibility: private
---

<!-- ex:id intro -->
# Title

<!-- ex:id p_one -->
A paragraph with {% term ref="def_x" %}a term{% /term %} and `<b>inline code</b>`.

<!-- plain comment -->

<!-- ex:id code_ex -->
```markdown
<!-- ex:id not_a_marker -->
{% graph id="g" %}
{% $x %}
<div>html in a fence</div>
```

<!-- ex:id fig -->
![Queue](assets/q.png)

---

{% definition id="def_x" term="X" %}
The definition.
{% /definition %}
