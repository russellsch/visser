# Packet: lossy conversion with a condition

This packet is invented for evaluation. A photo decoder produces a pixel
array. The resize operation caps the longer side at 224 pixels. If the input
is larger, the operation discards fine spatial detail. If both sides are at
most 224 pixels, this operation does not discard pixels. The output then
moves into a batch. This packet states no other loss.

Reader task: find the operation that can lose detail, state exactly when it
does, and predict whether a 200 by 180 pixel input loses detail. The article
must show the condition and loss before opening a part body or viewer. The
conversion must name the loss. The body may explain the resampling method.

Reject a figure that appears lossless while its only qualification sits in
the nonvisible `condition` attribute or a collapsed body. Do not invent
additional losses or claim that the decoder loses detail.
