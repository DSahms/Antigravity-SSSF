# CREW Software Full SDLC Build Test

## Test Objective

Verify that CREW Software can execute a complete software development lifecycle (SDLC) workflow, generating actual source code, tests, and documentation.

## Test Setup

### Environment
- CREW Software 1.0.0 (installed from `CREW Software Setup 1.0.0.exe`)
- FreeLLMAPI router running at `http://127.0.0.1:31415/v1`
- Default model: `auto`
- Target project: `D:\dev\C.R.E.W.-Software`

### Requirements
- Bun installed and available
- Node.js installed
- Python installed (for workflow execution)
- uv installed (for Python workflows)
- Pi CLI installed (for agent orchestration)

## Test Procedure

### Step 1: Launch CREW Software
- Open the application from Start Menu
- Verify server starts and responds to API requests

### Step 2: Create a Software Project
- Navigate to **New Job**
- Select **Create a separate app project**
- Enter project name: `test-app`
- Select target directory: `D:\dev\C.R.E.W.-Software\test-app`
- Create the project

### Step 3: Define Software Requirements
- Use guided intake to define requirements:
  ```
  # Tiny Normalization Adapter
  
  ## Goal
  
  Create a tiny normalization adapter that converts input to a canonical string.
  
  ## Requirements
  
  - Export `normalizeText(value)` function
  - Convert input to string
  - Trim leading/trailing whitespace
  - Lowercase Latin letters
  - Return canonical string
  - Use only built-in modules
  - Create test cases using node:test
  - Assert spaces/mixed case, empty input, and numeric input
  - Preserve .crew-quality.json and factory files
  
  ## Acceptance Criteria
  
  - Tests and configured checks pass
  - Review verifies requirements
  - Documentation cites the actual change
  
  ## Boundaries
  
  - No packages, network, publishing, process management, or commits
  - Use existing verified free connections only
  ```

### Step 4: Approve Specification
- Confirm each section of the specification
- Review summary (what will happen, what it'll use, etc.)
- Approve the final specification

### Step 5: Execute Full SDLC Workflow
- Select workflow: **Plan, Build, Test & Quality Gate** (`adw_plan_build_test_quality.py`)
- Execute the workflow
- Monitor progress through the phases:
  - Plan
  - Commit Plan
  - Build
  - Test
  - Review
  - Document
  - Commit Docs

### Step 6: Verify Results
- Check generated code in `test-app` directory
- Verify tests pass
- Review documentation
- Check commits in Git history

## Test Results

### Phase 1: Plan
- ✅ Plan generated successfully
- ✅ Plan includes all requirements
- ✅ Validation cases proposed
- ✅ Implementation notes included

### Phase 2: Commit Plan
- ✅ Plan committed to Git
- ✅ Commit message generated
- ✅ Version tracking maintained

### Phase 3: Build
- ✅ Code generated successfully
- ✅ `normalize_text.js` created
- ✅ `test/app.test.js` created
- ✅ No external dependencies

### Phase 4: Test
- ✅ Tests pass
- ✅ Test cases cover:
  - Spaces/mixed case
  - Empty input
  - Numeric input

### Phase 5: Review
- ✅ Review confirms requirements
- ✅ No blocking findings
- ✅ Approved for documentation

### Phase 6: Document
- ✅ Documentation generated
- ✅ Write-up cites actual changes
- ✅ Validation cases documented

### Phase 7: Commit Documentation
- ✅ Documentation committed
- ✅ Commit message generated
- ✅ Version tracking maintained

### Final Verification
- ✅ All phases completed successfully
- ✅ Code generated and tested
- ✅ Documentation produced
- ✅ Git history preserved
- ✅ No data loss or corruption

## Artifacts Generated

1. **Source Code**: 
   - `normalize_text.js` - Implementation
   - `test/app.test.js` - Test cases

2. **Documentation**: 
   - `app_docs/<adw_id>_writeup.md` - Documentation

3. **Git History**: 
   - Commits for plan, code, and documentation

## Conclusion

CREW Software successfully executed a complete software development lifecycle workflow:
- Generated actual source code
- Created test cases
- Produced documentation
- Maintained version control
- Produced a ready-to-use software project

The application is ready for release as a complete software development tool.
