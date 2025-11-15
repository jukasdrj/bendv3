# Contributing to BooksTrack Backend

We welcome contributions to the BooksTrack backend! To ensure the quality and stability of our codebase, we have established the following guidelines for contributions.

## Getting Started

1. Fork the repository and create a new branch for your feature or bug fix.
2. Make your changes and ensure that you follow the coding conventions used throughout the project.
3. Write tests for your changes and ensure that all tests pass.
4. Submit a pull request with a clear description of your changes.

## Testing Requirements

Testing is a critical part of our development process. All new code must be accompanied by tests.

### Code Coverage

We require a minimum of **75% test coverage** for all new code, especially for critical paths. We use Vitest for code coverage analysis. You can generate a coverage report by running `npm run test:coverage`.

### Test Naming Conventions

Please follow these naming conventions for your test files:

- For a file named `src/services/google-books.js`, the corresponding test file should be named `tests/unit/services/google-books.test.js`.
- Use descriptive names for your tests that clearly indicate what is being tested.

### No Flaky Tests

Flaky tests are not allowed. If a test fails intermittently, it must be fixed or removed before your pull request can be merged.

## Pull Request Process

1. Ensure that your pull request includes a clear and concise description of the changes you have made.
2. Your pull request will be reviewed by at least one member of the core team.
3. Once your pull request has been approved, it will be merged into the `main` branch.

Thank you for contributing to the BooksTrack backend!
