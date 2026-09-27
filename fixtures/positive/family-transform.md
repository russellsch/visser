---
format: visser/1
docId: 2b0c5e2a-2222-4a22-8a22-222222222222
title: Image decode pipeline
kind: teaching
capturedAt: 2026-09-27T00:00:00Z
visibility: private
---

<!-- vs:id intro -->
# Image decode pipeline

{% transform id="decode" title="Pixels change layout, not content" question="How does the representation change from file to GPU texture?" %}
Two inputs merge into one texture.

{% stage id="sg_file" label="PNG file" representation="compressed bytes" location="disk" %}
The encoded file.
{% /stage %}

{% stage id="sg_palette" label="Palette" representation="RGB triplets" shape=["entries", "channel"] %}
A lookup table.
{% /stage %}

{% stage id="sg_texture" label="Texture" representation="RGBA8" shape=["height", "width", "channel"] units="bytes" location="GPU memory" ownership="renderer" %}
Decoded pixels combined with the palette.
{% /stage %}

{% conversion id="cv_decode" from="sg_file" to="sg_texture" label="inflate and unfilter" loss="none" %}
Lossless.
{% /conversion %}

{% conversion id="cv_apply" from="sg_palette" to="sg_texture" label="expand indices" condition="indexed PNG only" %}
Only for palette images.
{% /conversion %}
{% /transform %}
