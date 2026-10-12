# Pi Agent Harness — Setup Notes for the Owner

> The mission's section 9 says "Time-box this to three real attempts, then document and move on." The `pi` binary is not present in the crew's sandbox, so we could not perform real attempts here. This doc gives you the exact configuration to try on your machine, and the one-thing-at-a-time order to try.

## What to do

1. **Install pi** (if you haven't): `curl -fsSL https://pi.ai/install | sh` (or your platform's equivalent). Confirm with `pi --version`.

2. **Start KoboldCpp** at `http://127.0.0.1:5001/v1` with a small model loaded. Note the exact model id from `curl http://127.0.0.1:5001/v1/models`. (We default the local profile to `koboldcpp/default`; if your server returns a different id, change it in Settings.)

3. **Write the models.json Pi actually reads.** Path:
   - Linux / macOS: `~/.pi/agent/models.json` (or `$PI_MODELS_PATH` if set).
   - Windows: `%USERPROFILE%\.pi\agent\models.json`.

   Contents (replace `<model-id>` with the exact id from step 2):

   ```json
   {
     "providers": [
       {
         "name": "koboldcpp-local",
         "baseUrl": "http://127.0.0.1:5001/v1",
         "api": "openai-completions",
         "apiKey": "none",
         "models": [
           {
             "id": "<model-id>",
             "contextWindow": 8192,
             "reasoning": false,
             "compat": {
               "supportsDeveloperRole": false,
               "maxTokensField": "max_tokens",
               "supportsStore": false
             }
           }
         ]
       }
     ]
   }
   ```

   - `baseUrl` MUST be `http://127.0.0.1:5001/v1`, NOT `localhost` — earlier builds failed on `localhost` DNS resolution under some configurations.
   - `contextWindow` should match the context size KoboldCpp was launched with (often 8192, but check your launch flags).
   - `reasoning: false` — KoboldCpp's OpenAI-compatible endpoint doesn't expose reasoning.
   - `compat.supportsDeveloperRole: false` — KoboldCpp doesn't accept the `developer` role.
   - `compat.maxTokensField: "max_tokens"` — KoboldCpp uses OpenAI's older field name.
   - `compat.supportsStore: false` — no session store.

4. **Confirm with `pi --list-models`** — you should see your `<model-id>` listed under the `koboldcpp-local` provider.

5. **Try pi directly with a trivial prompt** — `pi -p <model-id> "Reply with the word OK and nothing else."` You should get `OK` back. If not, change ONE thing at a time (see "What to change one at a time" below).

6. **Try one trivial step through the app.** Start CREW Studio (`just studio`), open Settings, set the planner role's local profile to the `<model-id>` (use "Fetch models" to populate the dropdown from your running KoboldCpp). Then in the New Job screen, type a one-liner like "Reply with OK", continue to Review & Approve, approve, and run `adw_prompt.py` (single agent prompt). The console should show the model responding.

7. **If a small local model cannot make valid tool calls, say so plainly** in your follow-up. Some local models (especially sub-3B) can't reliably produce the JSON tool-call format the factory expects. That's a model limitation, not a CREW bug.

## What to change one at a time

If `pi --list-models` doesn't list your model, in this order:

1. Confirm the JSON parses: `cat ~/.pi/agent/models.json | python3 -m json.tool`.
2. Confirm `baseUrl` is `http://127.0.0.1:5001/v1` (not `localhost`).
3. Confirm the model id in `models[0].id` matches what KoboldCpp's `/v1/models` returns exactly (case-sensitive).

If `pi` lists the model but the trivial prompt fails:

4. Try `api: "openai-chat-completions"` instead of `"openai-completions"` (KoboldCpp supports both, but the chat endpoint is more common).
5. Try removing the `compat` block entirely; re-add fields one at a time.
6. Try a different model — some local models just don't follow instructions.

If pi works directly but the app fails:

7. Check that the roster in `adws/adw_sssf_config/sssf.config.yaml` uses `coding_agent: pi` and the agent's `model:` is written as `koboldcpp-local/<model-id>` (provider prefix is required by the factory's `agents.validate()`).
8. Check that the `PI_PATH` env var (if you set one) points at the right `pi` binary.

## Report which change fixed it

After each change, re-run the failing step. Note in your follow-up: "Change N fixed it." If after 3 changes nothing works, document what you tried and move on. Don't keep tweaking the app — the problem is almost certainly in the Pi ↔ KoboldCpp connection, not in CREW.
