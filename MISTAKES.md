# Mistakes

Ran a pip dry-run against Homebrew-managed Python without the PEP 668 dry-run override | Assumed `--dry-run` bypassed the externally managed environment guard | The first resolver validation failed without changing the environment | Use a virtual environment, or pair `--break-system-packages` strictly with `--dry-run` for non-mutating resolver checks
