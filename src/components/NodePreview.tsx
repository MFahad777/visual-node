import React from 'react';

interface NodePreviewProps {
  /**
   * The node type (required).
   * @example "express.route", "logic.branch", "operators.add"
   */
  type: string;

  /**
   * Optional node configuration data.
   * @example {{ path: "/users", method: "GET" }}
   */
  data?: Record<string, unknown>;

  /**
   * Height of the iframe in pixels. Default: 500.
   */
  height?: number;

  /**
   * Width of the iframe as CSS value. Default: "100%".
   */
  width?: string;
}

/**
 * Live embedded node preview component for Docusaurus.
 * Renders the real GenericNode component from the editor-ui in an iframe.
 *
 * @example
 * ```mdx
 * <NodePreview type="express.route" data={{ path: "/users", method: "GET" }} />
 * ```
 */
export default function NodePreview({
  type,
  data,
  height = 500,
  width = '100%',
}: NodePreviewProps) {
  // Encode the data parameter as URL-safe JSON
  const dataParam = data ? `&data=${encodeURIComponent(JSON.stringify(data))}` : '';

  // Construct the iframe src: relative path to the preview harness
  // The iframe will be embedded in pages at docs/<section>/<page>.mdx
  // which compile to /<section>/<page> routes, so we need to go up the right number of levels
  // Using a root-relative path /visual-node/node-preview/... is safer
  const iframeSrc = `/visual-node/node-preview/preview.html?type=${encodeURIComponent(type)}${dataParam}`;

  return (
    <div style={{ marginBottom: '2rem' }}>
      <iframe
        src={iframeSrc}
        width={width}
        height={height}
        style={{
          border: '1px solid var(--ifm-color-emphasis-200)',
          borderRadius: '0.25rem',
          display: 'block',
        }}
        title={`Live preview of ${type} node`}
        loading="lazy"
      />
    </div>
  );
}
