---
name: visser-visual-explain
description: Create or revise source-grounded visual explanations, architecture documents, plans, root-cause explanations, and teaching documents with the Visser toolkit. Use when a user requests this document workflow or provides a Visser reference packet. Do not turn every ordinary technical answer into a generated website.
---

# Visser (adapter)

This file only loads the pinned Visser skill. It holds no instructions of its own.

1. Run the user shim, never a script inside this repository:

   ```sh
   node "${VISSER_HOME:-$HOME/.visser}/bin/visser.cjs" skill show --doc PATH
   ```

   Use `--doc PATH` for an existing document. Omit it for a new document.

2. Follow the skill text that the command prints. It comes from the toolkit
   that the document's lock pins.

3. If the command fails with `E_TOOLKIT_MISSING` or `E_TOOLKIT_UNTRUSTED`, or
   the shim does not exist, stop. Tell the user what the message says. Do not
   install or trust a toolkit yourself.
