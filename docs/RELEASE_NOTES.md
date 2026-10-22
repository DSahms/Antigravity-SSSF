# CREW Software Release Notes

## Version 1.0.0

### Overview
CREW Software is a complete software-development workflow application that enables guided intake, requirements gathering, planning, implementation, testing, and review through agent orchestration.

### Features

- **Guided Intake**: Intake modes (talk/upload/paste), read-back, drafts
- **Requirement Management**: Section confirmation, approval summary, and version tracking
- **Agent Orchestration**: Multi-agent workflows with approval gates
- **Project Management**: Create, switch, and manage software projects
- **Workflow Execution**: Full SDLC (plan, build, test, review, document)
- **Persistence**: Save drafts, approvals, and workflow history
- **Multi-Provider Support**: FreeLLMAPI (default), KoboldCpp, and cloud providers
- **UI Experience**: Calm, warm palette with clear navigation and visual organization
- **REA Investigation**: Static analysis of existing software with evidence-backed findings
- **Project Switching**: Seamless switching between different software projects

### Installation

1. Download the installer from the release directory
2. Run the installer and follow the setup wizard
3. Launch CREW Software from the Start Menu or via command line

### Configuration

After installation, configure your agent connections:
- Default provider: FreeLLMAPI
- Base URL: `http://127.0.0.1:31415/v1`
- Default model: `auto`
- API Key: `freellmapi-2b17fe48864ac41d5db3c181a0332bd0275556e58e8ae16a`

### Usage

1. Create a new software project
2. Describe the software requirements
3. Generate a specification and approve it
4. Execute the approved workflow
5. Review and inspect the generated code and documentation

### Requirements

- Windows 10 or 11
- Node.js
- Bun
- Git (optional)
- Python (optional)
- uv (optional)
- Pi CLI (optional)

### Known Limitations

- Requires manual installation of Bun and other dependencies
- Some workflows may need additional dependencies
- FreeLLMAPI router must be running at `http://127.0.0.1:31415/v1`

### Release Artifacts

- Installer: `CREW Software Setup 1.0.0.exe`
- SHA-256 Checksum: `C695FE26E67F2CBAB7E458D02590D4E3B56CF611D3B3BD69B692EABAC395D41B`
- Installer Size: `224941587 bytes`

### Installation Instructions

See `INSTALLATION_INSTRUCTIONS.md` for detailed setup instructions.

### Support

For support and feedback, contact the CREW Technologies team.
