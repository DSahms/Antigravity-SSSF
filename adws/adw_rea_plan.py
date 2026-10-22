# /// script
# dependencies = ["pydantic", "python-dotenv", "pyyaml", "rich"]
# ///
"""Investigate and plan only: real REA evidence, interpretation and planning; no commits or build."""
import argparse
import sys
from adw_modules import utils
from adw_simple_sdlc_rea import main as investigate

REQUIRED_AGENTS = ["rea", "planner"]

def main(prompt, config="adws/adw_sssf_config/sssf.config.yaml", adw_id=None):
    return investigate(prompt, config, adw_id, stop_after_plan=True)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("prompt")
    parser.add_argument("--config", default="adws/adw_sssf_config/sssf.config.yaml")
    parser.add_argument("--adw-id", default=None)
    args = parser.parse_args()
    sys.exit(main(utils.resolve_prompt(args.prompt), args.config, args.adw_id))
