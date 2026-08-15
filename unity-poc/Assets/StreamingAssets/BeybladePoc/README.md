# Beyblade POC Streaming Assets

Optional visual-only STL files can be placed in this folder:

- `left.stl`
- `right.stl`

The Unity proof-of-concept reads these files at runtime and uses them only as rendered geometry. Physics still comes from the compound primitive proxy colliders created in code.

STL files are treated as CAD-style Z-up millimeter exports and are normalized to the current bey proxy size.
