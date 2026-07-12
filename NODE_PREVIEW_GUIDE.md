# NodePreview Component Guide

The `NodePreview` component embeds live, interactive previews of Visual Node nodes in Docusaurus documentation pages.

## Quick Start

### 1. Import the Component

```mdx
import NodePreview from '@site/src/components/NodePreview';
```

### 2. Add a Preview

```mdx
<NodePreview type="express.route" />
```

### 3. With Configuration

```mdx
<NodePreview 
  type="express.route" 
  data={{ path: "/users/:id", method: "GET" }}
/>
```

## Component Props

| Prop | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `type` | `string` | ✓ | — | Node type (e.g., `"express.route"`, `"logic.branch"`) |
| `data` | `Record<string, unknown>` | ✗ | `{}` | Node configuration object |
| `height` | `number` | ✗ | `500` | Height of iframe in pixels |
| `width` | `string` | ✗ | `"100%"` | Width of iframe (CSS value) |

## Examples by Category

### Server Setup
```mdx
<NodePreview type="express.init" />
<NodePreview type="express.listen" data={{ port: 3000 }} />
<NodePreview type="express.middleware.jsonParser" />
```

### Routing
```mdx
<NodePreview type="express.route" data={{ path: "/api/users", method: "POST" }} />
```

### Control Flow
```mdx
<NodePreview type="controlFlow.branch" />
<NodePreview type="controlFlow.sequence" />
<NodePreview type="controlFlow.switch" data={{ cases: ["admin", "user"] }} />
```

### Operators
```mdx
<NodePreview type="operators.add" />
<NodePreview type="operators.equal" data={{ strict: false }} />
<NodePreview type="operators.and" />
```

### Arrays
```mdx
<NodePreview type="array.map" />
<NodePreview type="array.filter" />
<NodePreview type="array.reduce" />
```

### Logic & Variables
```mdx
<NodePreview type="logic.function" data={{ name: "myFunction" }} />
<NodePreview type="variable.get" data={{ variableId: "var_1" }} />
<NodePreview type="variable.set" />
```

## Creating Node Documentation Pages

### Step 1: Copy the Template
```bash
cp docs/_node-template.mdx docs/nodes/my-node.mdx
```

### Step 2: Fill in the Details
- Replace `"Node Name"` with the actual node name
- Update the `type` in NodePreview components
- Add configuration examples for that node type
- Write description and use cases

### Step 3: Example File Structure

```
docs/
├── nodes/
│   ├── express-init.mdx
│   ├── express-route.mdx
│   ├── express-listen.mdx
│   ├── logic-branch.mdx
│   ├── logic-function.mdx
│   ├── array-map.mdx
│   └── ... (one per node type)
```

### Step 4: Update Sidebar (if needed)
Add your new pages to `sidebars.ts` under the appropriate section.

## How It Works

1. **Query String Parameters**: The component builds a URL with `?type=<nodeType>&data=<jsonData>`
2. **iframe Embedding**: The URL points to `/visual-node/node-preview/preview.html`
3. **Live Rendering**: The preview harness renders the real `GenericNode` component with your configuration
4. **Auto-Updates**: When the main editor-ui styling changes, all previews update automatically (no manual action needed)

## Troubleshooting

### Preview not loading?
- Check that the preview bundle was deployed: `../node-blueprint-docs/static/node-preview/` should exist
- Verify the node type is correct (check the node registry in the editor-ui)
- Open browser DevTools to check for CORS or fetch errors

### Preview shows wrong styling?
- Ensure you've run `pnpm docs:refresh-previews` from the main repo to sync the latest bundle

### Data prop not showing?
- JSON must be valid and match the node's expected config schema
- Check the `NodeConfigPanel` in editor-ui for the exact field names and types

## Finding Node Type Names

All builtin node types are listed in the editor-ui node browser or in the node registry:
- Server: `express.init`, `express.listen`, `express.middleware.jsonParser`
- Routing: `express.route`, `middleware.customCode`
- Control Flow: `controlFlow.branch`, `controlFlow.sequence`, `controlFlow.switch`
- Logic: `logic.function`, `logic.require`, `logic.export`, `logic.pathExtractor`, `logic.begin`, `logic.handlerFunction`
- Variables: `variable.get`, `variable.set`
- Operators: `operators.add`, `operators.subtract`, `operators.multiply`, `operators.divide`, `operators.modulo`, `operators.equal`, `operators.notEqual`, `operators.greaterThan`, `operators.lessThan`, `operators.greaterOrEqual`, `operators.lessOrEqual`, `operators.and`, `operators.nand`, `operators.or`, `operators.nor`, `operators.xor`, `operators.not`
- Arrays: `array.map`, `array.filter`, `array.reduce`, `array.forEach`, `array.flatMap`, `array.push`, `array.pop`, `array.unshift`, `array.shift`, `array.find`, `array.findIndex`, `array.includes`, `array.indexOf`, `array.every`, `array.some`
- Debug: `debug.consoleLog`

## Next Steps

1. Start creating node documentation pages using the template
2. Add previews for each node type
3. Link related nodes together
4. Consider organizing pages by category (Server, Routing, Control Flow, etc.)
5. Update `sidebars.ts` to create a Node Reference section if it doesn't exist
