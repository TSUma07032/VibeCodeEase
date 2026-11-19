1. **Optimize `checkTrailingSpaces` in `src/core/analyzer.ts`**
   - Replace the expensive Regex `/^(.*\S)( +)$/` matching in `checkTrailingSpaces` with a fast O(n) reverse iteration character check. Regex execution is slow on hot paths for large files.
   - We will manually scan backward to find the trailing spaces, and ensure there is at least one non-whitespace character in the line to match the regex semantic.
   - **Verification:** Check `git diff` after modification.
2. **Update Bolt Journal (`.jules/bolt.md`)**
   - Add an entry about optimizing regex in hot paths.
   - **Verification:** Check `git diff` for the journal update.
3. **Execute Pre-commit Steps**
   - Complete pre-commit steps.
4. **Submit Pull Request**
   - Submit a PR with the performance improvement.
