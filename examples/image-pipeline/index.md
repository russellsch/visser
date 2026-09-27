---
format: visser/1
docId: ed3b2b96-656d-42cd-a66e-c98aa19dbbd0
title: How a stored photo becomes a model input batch
kind: teaching
capturedAt: 2026-09-27T00:00:00Z
reader:
  profile: experienced-systems-engineer
  knows: [arrays, image files]
  new: [tensor layout conventions in this illustrative pipeline]
  mustUnderstand: [where detail is lost, where the data moves to the accelerator]
visibility: private
---

<!-- vs:id overview -->
# How a stored photo becomes a model input batch

<!-- vs:id p_claim -->
The pipeline changes three things at different points: the encoding (compressed
bytes to pixel values), the shape and layout (height-width-channel to
channel-first batches), and the location (host memory to accelerator memory).
Only the resize step discards information; every later step is reversible up to
floating-point rounding.

<!-- vs:id p_scope -->
This is an illustrative pipeline. The sizes are example values, not the
requirements of a particular model.

{% transform id="to_batch" title="Photo to batch" question="Where do encoding, shape, and memory location change, and where is detail lost?" %}
Each box is one representation of the same image. The arrows name the
operation and state any loss.

{% stage id="sg_file" label="JPEG file" representation="compressed bytes" location="disk" units="bytes" %}
The file stores DCT-compressed data. Its size says little about the pixel
count.
{% /stage %}

{% stage id="sg_decoded" label="Decoded image" representation="pixel array" shape=["height", "width", "channel"] units="uint8, 0 to 255" location="host memory" %}
Channel order is RGB. Height and width are those of the original photo.
{% /stage %}

{% stage id="sg_resized" label="Resized image" representation="pixel array" shape=["224", "224", "channel"] units="uint8, 0 to 255" location="host memory" %}
Every image now has the same spatial size, which batching requires.
{% /stage %}

{% stage id="sg_thumb" label="Preview thumbnail" representation="compressed bytes" shape=["96", "96", "channel"] location="object store" %}
A side output for the review interface. It does not feed the model.
{% /stage %}

{% stage id="sg_tensor" label="Normalized tensor" representation="float tensor" shape=["channel", "224", "224"] units="float32, mean 0, unit variance per channel" location="host memory" %}
Channels move to the first axis because the model expects channel-first input.
{% /stage %}

{% stage id="sg_batch" label="Batch on accelerator" representation="float tensor" shape=["batch", "channel", "224", "224"] units="float32" location="accelerator memory" ownership="training step" %}
The training step owns this buffer until the step completes.
{% /stage %}

{% conversion id="cv_decode" from="sg_file" to="sg_decoded" label="decode" %}
Decoding recovers the pixels that the encoder kept. It adds no new loss; the
loss happened when the JPEG was written.
{% /conversion %}

{% conversion id="cv_resize" from="sg_decoded" to="sg_resized" label="resize to 224 by 224" loss="downsampling discards fine detail; aspect ratio is not preserved" %}
This is the only lossy step in the pipeline. Small text or thin lines in the
original photo may not survive.
{% /conversion %}

{% conversion id="cv_thumb" from="sg_resized" to="sg_thumb" label="encode preview" loss="re-encoding as JPEG" %}
The branch runs after resizing so the preview shows what the model sees.
{% /conversion %}

{% conversion id="cv_normalize" from="sg_resized" to="sg_tensor" label="scale, normalize, transpose" %}
Values become floats, per-channel statistics are subtracted and divided, and
axes are reordered.
{% /conversion %}

{% conversion id="cv_batch" from="sg_tensor" to="sg_batch" label="stack and copy to accelerator" condition="when a full batch is ready" %}
Stacking adds the batch axis. The copy moves ownership from the loader to the
training step.
{% /conversion %}
{% /transform %}

<!-- vs:id p_debugging -->
When a model misreads fine detail, check the resize step first: it is the only
place this pipeline removes information.
