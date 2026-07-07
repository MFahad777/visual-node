# Map Objects Example

Demonstrates the **Array Map** loop node with object property extraction.

## What it does

An `extractNames()` function that takes an array of user objects and returns a new array containing only the names.

```javascript
extractNames([
  { name: "Alice", age: 25 },
  { name: "Bob", age: 30 }
])
// returns ["Alice", "Bob"]
```

## Visual Flow

- **Map Node**: Iterates over the input array
- **Custom Code**: Extracts the `name` property from each object
- **Return Node**: Captures the mapped result

This example shows extracting properties from objects during iteration.
