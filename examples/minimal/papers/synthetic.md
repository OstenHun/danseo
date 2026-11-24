---
schema_version: draft-2
type: paper
id: paper-synthetic
source:
  version: synthetic-v1
  url: https://example.invalid/synthetic
review:
  status: draft
  reason: Synthetic material for behavior checks, not a real paper.
claims:
  - id: C-DEMO-01
    statement: Reports 12 points for setting A and 9 points for setting B on a separate sample.
    locators:
      - type: table
        value: "1"
  - id: C-DEMO-02
    statement: The same item is reported as 0.02 in Table 2 and 0.03 in Table 3.
    locators:
      - type: table
        value: "2"
      - type: table
        value: "3"
# Unknown fields and comments must survive reading and export.
demo_extension: preserve-me
---
# Synthetic paper · conditions and inconsistency

Summary: A CLI check example, not real research. It confirms that different conditions and unresolved values survive export.

## Conditions and limits

In this fictional setup, A used 100 inputs and B used 25. Do not subtract 9 from 12 and call it an improvement. The measure is not a success rate.

## Unresolved

The 0.02 in Table 2 and the 0.03 in Table 3 are a synthetic case that needs a source check. Do not pick either value as correct. The URL is a behavior example, not a real paper address.
