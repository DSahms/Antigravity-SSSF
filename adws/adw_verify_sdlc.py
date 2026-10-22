# /// script
# dependencies = ["pydantic", "python-dotenv", "pyyaml", "rich"]
# ///
"""The standard SDLC acceptance checks with all commit phases omitted. Outputs stay uncommitted."""
import argparse
import sys
from adw_modules import utils
from adw_simple_sdlc import main as sdlc

def main(prompt, config="adws/adw_sssf_config/sssf.config.yaml", adw_id=None):
    return sdlc(prompt, config, adw_id, commit_outputs=False)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("prompt")
    parser.add_argument("--config", default="adws/adw_sssf_config/sssf.config.yaml")
    parser.add_argument("--adw-id", default=None)
    args = parser.parse_args()
    sys.exit(main(utils.resolve_prompt(args.prompt), args.config, args.adw_id))
