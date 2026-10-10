# Mathematical exposition

Read this guide when a Visser document considers or uses supported math in
prose, labels, display equations, or an `equation` target. Read
[format](format.md#10-equations) for syntax and supported LaTeX.

## Choose notation for a reader task

Use math when it makes a rule, quantity, boundary, or transformation less
ambiguous than prose. Use prose when a number or comparison answers the
question without symbolic work. Do not add an equation as decoration.

State what the equation answers before or after it. Define each symbol at its
first useful occurrence. Keep the unit beside a value when it affects a
decision. State an assumption that changes the result, such as a fixed rate,
an independent input, or a permitted range.

Use inline math for a short term in a sentence or a readable label. Use a
display for a relation that the reader must inspect. Use `equation` when a
stable target and number help later discussion. Keep a flow label short; put
the derivation and its conditions in prose, a body, or an equation target.

## Preserve exact meaning

Do not rewrite TeX, units, inequalities, identifiers, or quoted source merely
to meet prose style. Explain the notation around them in clear prose. A label
such as `$p \leq 0.05$` may stay exact. Its surrounding sentence should say
what happens at the boundary and who uses the rule.

An equality, approximation, and inequality make different claims. Preserve
the sign, grouping, index bounds, and unit. Do not replace `x < T` with
`x \leq T`, or remove a denominator, exponent, or condition to shorten text.
Say whether a bound includes its endpoint when that changes the result.

## Review mathematics

Check each material expression against its source:

- Identify every symbol, unit, input, output, and stated assumption.
- Check dimensions and conversions. A rate, count, duration, and percentage
  do not substitute for one another.
- Trace a representative input and a boundary input. Test both sides of an
  inequality where the source defines them.
- Check signs, parentheses, exponents, index endpoints, and approximation
  markers in the rendered and source forms.
- Confirm that a reference points to the right `equation` and that the prose
  explains the conclusion the reader must use.

If a source lacks a definition, unit, or assumption that the result needs,
state the gap. Do not invent a value or derivation to complete the figure.
