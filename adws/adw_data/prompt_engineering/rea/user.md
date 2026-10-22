# Approved investigation

{{prompt}}

# Deterministic collection envelope

{{previous_envelope}}

The engine evidence projection is included in the approved-investigation
section above. Return the ReaOutput JSON now, without tools or prose outside
the JSON. Artifacts must be [] because the engine writes identical handoff
copies after validating your interpretation and assignment. Describe validation
cases as proposed checks, never as executed tests.

## Exact response shape

Use string arrays for unknowns, limitations, behavioral_requirements and
validation_cases. Do not return objects in those arrays.

observed_facts is an array of FLAT objects with two STRING fields:
- "observation": one sentence describing what was seen, in plain words.
- "evidence": one string naming where — a module path, a file:line, or an edge ID.

Do NOT copy the nested evidence objects from the projection. The projection's
observations have a "label" and a nested "evidence" object; you must flatten
each into a single observation string and a single evidence string.

inferences is an array of FLAT objects with two STRING fields:
- "claim": one sentence stating the conclusion.
- "evidence": one string naming the supporting observation, module path, or edge ID.

Example shape:
{"status":"success","summary":"Static findings","artifacts":[],"question":"copy exactly","target":"copy exactly","scope":"copy exactly","permitted_actions":"static-local","observed_facts":[{"observation":"module present","evidence":"module.js:1"}],"inferences":[{"claim":"static dependency","evidence":"edge jag_edge_31b2b38b"}],"unknowns":["runtime not observed"],"limitations":["static inspection only"],"behavioral_requirements":["proposed requirement"],"validation_cases":["proposed input and expected output; not executed"]}
