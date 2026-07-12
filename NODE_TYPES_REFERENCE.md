# Node Types Reference

Complete list of all 54 builtin node types available for use in documentation with the `NodePreview` component.

## Server (3 nodes)

| Type | Name | Purpose |
|------|------|---------|
| `express.init` | Express Init | Initialize Express app instance |
| `express.listen` | Express Listen | Start the server on a port |
| `express.middleware.jsonParser` | JSON Parser | Parse incoming JSON bodies |

## Routing (2 nodes)

| Type | Name | Purpose |
|------|------|---------|
| `express.route` | Route | Define an HTTP endpoint |
| `middleware.customCode` | Custom Middleware | Execute custom middleware code |

## Handler (1 node - replaced by `logic.handlerFunction`)

| Type | Name | Purpose |
|------|------|---------|
| `logic.handlerFunction` | Handler Function | Named Express request handler |

## Control Flow (3 nodes)

| Type | Name | Purpose |
|------|------|---------|
| `controlFlow.branch` | Branch | Conditional execution (if/else) |
| `controlFlow.sequence` | Sequence | Execute multiple paths in order |
| `controlFlow.switch` | Switch | Multi-way branching with cases |

## Logic (8 nodes)

| Type | Name | Purpose |
|------|------|---------|
| `logic.function` | Function | Declare a named function |
| `logic.functionCall` | Function Call | Call a function (same-file or require) |
| `logic.require` | Require | Import a module |
| `logic.export` | Export | Mark functions/variables for export |
| `logic.pathExtractor` | Path Extractor | Extract/call nested object properties |
| `logic.begin` | Begin | Module-load entry point |
| `logic.expression` | Expression | Evaluate a JavaScript expression |
| `logic.graphEntry` | Entry (in Function graphs) | Function parameter input |
| `logic.graphReturn` | Return (in Function graphs) | Return value from function |
| `logic.graphParam` | Graph Param (legacy) | (Deprecated) old per-param model |

## Variables (2 nodes)

| Type | Name | Purpose |
|------|------|---------|
| `variable.get` | Get Variable | Read a variable value |
| `variable.set` | Set Variable | Assign a variable value |

## Operators (17 nodes)

### Arithmetic (5 nodes)
| Type | Name | Purpose |
|------|------|---------|
| `operators.add` | Add | Numeric or string concatenation |
| `operators.subtract` | Subtract | Numeric subtraction |
| `operators.multiply` | Multiply | Numeric multiplication |
| `operators.divide` | Divide | Numeric division |
| `operators.modulo` | Modulo | Numeric modulo (remainder) |

### Comparison (6 nodes)
| Type | Name | Purpose |
|------|------|---------|
| `operators.equal` | Equal | Value equality (=== or ==) |
| `operators.notEqual` | Not Equal | Value inequality (!== or !=) |
| `operators.greaterThan` | Greater Than | > comparison |
| `operators.lessThan` | Less Than | < comparison |
| `operators.greaterOrEqual` | Greater Or Equal | >= comparison |
| `operators.lessOrEqual` | Less Or Equal | <= comparison |

### Boolean (6 nodes)
| Type | Name | Purpose |
|------|------|---------|
| `operators.and` | AND | Logical AND (variadic) |
| `operators.nand` | NAND | Logical NAND (variadic) |
| `operators.or` | OR | Logical OR (variadic) |
| `operators.nor` | NOR | Logical NOR (variadic) |
| `operators.xor` | XOR | Logical XOR (variadic) |
| `operators.not` | NOT | Logical NOT |

## Array (15 nodes)

### Iteration/Transformation (5 nodes)
| Type | Name | Purpose |
|------|------|---------|
| `array.map` | Map | Transform each element |
| `array.filter` | Filter | Keep elements matching condition |
| `array.reduce` | Reduce | Accumulate to single value |
| `array.forEach` | forEach | Execute for each element |
| `array.flatMap` | FlatMap | Map then flatten results |

### Mutation (4 nodes)
| Type | Name | Purpose |
|------|------|---------|
| `array.push` | Push | Add element to end |
| `array.pop` | Pop | Remove last element |
| `array.unshift` | Unshift | Add element to start |
| `array.shift` | Shift | Remove first element |

### Search/Access (6 nodes)
| Type | Name | Purpose |
|------|------|---------|
| `array.find` | Find | Get first element matching condition |
| `array.findIndex` | FindIndex | Get index of first match |
| `array.includes` | Includes | Check if array contains value |
| `array.indexOf` | IndexOf | Get index of value |
| `array.every` | Every | Check if all match condition |
| `array.some` | Some | Check if any match condition |

## Debugging (1 node)

| Type | Name | Purpose |
|------|------|---------|
| `debug.consoleLog` | Console Log | Output to console |

## Plugin Nodes (User-defined)

Plugin nodes use the `plugin.*` namespace (e.g., `plugin.httpRequest`, `plugin.uuidResponder`).

## Quick Copy-Paste Examples

```mdx
<!-- Server setup -->
<NodePreview type="express.init" />
<NodePreview type="express.listen" data={{ port: 3000 }} />

<!-- Routing -->
<NodePreview type="express.route" data={{ path: "/api/users", method: "GET" }} />

<!-- Control flow -->
<NodePreview type="controlFlow.branch" />
<NodePreview type="controlFlow.switch" data={{ cases: ["admin", "user"] }} />

<!-- Variables -->
<NodePreview type="variable.get" data={{ variableId: "userId" }} />

<!-- Operators -->
<NodePreview type="operators.add" />
<NodePreview type="operators.equal" data={{ strict: true }} />

<!-- Arrays -->
<NodePreview type="array.map" />
<NodePreview type="array.filter" />

<!-- Logic -->
<NodePreview type="logic.function" data={{ name: "processData" }} />
<NodePreview type="logic.require" data={{ path: "lodash" }} />
```
