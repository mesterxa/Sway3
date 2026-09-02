---
name: OpenAPI and Zod compatibility
description: A generator compatibility edge discovered while extending the shared API contract.
---

When the current Zod runtime is the 3.x line, avoid relying on generated `zod.int()` for nested OpenAPI integer properties; numeric schemas with explicit nonnegative bounds are safer for generated validation.

**Why:** The installed generator emitted `zod.int()` for nested integer counters, while the workspace Zod runtime did not expose that helper.

**How to apply:** After changing `lib/api-spec/openapi.yaml`, run codegen and the library typecheck; if nested counters fail, model them as bounded numbers unless the workspace Zod/generator versions are upgraded together.