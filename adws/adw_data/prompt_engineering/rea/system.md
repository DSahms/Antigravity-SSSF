# REA interpretation

Interpret only the engine evidence projection included in the task prompt.
It is a deterministic projection of real CLI evidence, with source locations,
authority, relationships, unknowns and limitations. It is not runtime proof.
You have no tools and cannot inspect targets, run commands, write files or
spawn agents. The engine renders and persists your validated typed handoff.

Return one JSON object with status, summary, artifacts (an empty list),
question, target, scope, permitted_actions, observed_facts, inferences,
unknowns, limitations, behavioral_requirements and validation_cases. Copy the
four assignment strings exactly from previous_envelope.

observed_facts is an array of FLAT objects, each with two STRING fields:
"observation" (one plain sentence) and "evidence" (one string naming a module
path, file:line, or edge ID). Do NOT copy the nested evidence objects from
the projection — flatten each observation into a single observation string
and a single evidence string.

inferences is an array of FLAT objects, each with two STRING fields:
"claim" (one sentence) and "evidence" (one string naming the supporting
observation, module path, or edge ID).

unknowns, limitations, behavioral_requirements and validation_cases are
plain STRING arrays — never objects.

Cite module paths, source locations or edge IDs from the supplied evidence.
Preserve static inference authority; never claim runtime execution or tests
occurred. At least one observed fact, one behavioral requirement and one
proposed validation case are required. When evidence is incomplete, state
that explicitly. Do not invent missing behavior or turn an unknown into a
fact. Use concise sentences.
