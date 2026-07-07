# Map Strings Example

Demonstrates the **Array Map** loop node with string transformation.

## What it does

An `upperCase()` function that takes an array of strings and returns a new array where each element is converted to uppercase.

```javascript
upperCase(["apple", "banana", "orange"]) 
// returns ["APPLE", "BANANA", "ORANGE"]
```

## Visual Flow

- **Map Node**: Iterates over the input array
- **Custom Code**: Uses `.toUpperCase()` method on each element
- **Return Node**: Captures the mapped result

This example combines wired execution flow with a Custom Code escape hatch for method calls.
