echo "node --version"
node --version
echo "exit_code: $?"

echo "node scripts/verify-m2m-harness.mjs"
node scripts/verify-m2m-harness.mjs
echo "exit_code: $?"

echo "node --test tests/m2m/harness.test.mjs"
node --test tests/m2m/harness.test.mjs > /dev/null
echo "exit_code: $?"

echo "npm run lint"
npm run lint
echo "exit_code: $?"

echo "npm run build"
npm run build
echo "exit_code: $?"

echo "git diff --check"
git diff --check
echo "exit_code: $?"

echo "git status --short"
git status --short
echo "exit_code: $?"
