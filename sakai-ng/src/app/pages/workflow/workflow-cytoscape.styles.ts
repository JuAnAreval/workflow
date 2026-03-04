import cytoscape from 'cytoscape';

const BASE_NODE_WIDTH = 264;
const BASE_NODE_HEIGHT = 84;

export const WORKFLOW_CYTOSCAPE_STYLE: cytoscape.StylesheetJson = [
  {
    selector: 'node',
    style: {
      label: 'data(displayLabel)',
      shape: 'round-rectangle',
      width: BASE_NODE_WIDTH,
      height: BASE_NODE_HEIGHT,
      color: '#24374b',
      'font-size': 16,
      'font-weight': 700,
      'font-family': 'Segoe UI, Arial, sans-serif',
      'text-valign': 'center',
      'text-halign': 'center',
      'text-justification': 'center',
      'text-wrap': 'wrap',
      'line-height': 1.14,
      'text-max-width': '220px',
      'text-margin-x': 0,
      'text-margin-y': 0,
      'text-background-opacity': 0,
      'background-color': '#ffffff',
      'background-fill': 'solid',
      'border-width': 1,
      'border-color': '#d0dbe7',
      'outline-width': 0,
      'outline-offset': 0,
      'overlay-opacity': 0,
      'transition-property':
        'border-width border-color background-color outline-width outline-color opacity',
      'transition-duration': 130,
      'transition-timing-function': 'ease-out',
    },
  },
  {
    selector: 'node[kind = "trigger"]',
    style: {
      'background-color': '#f6fcf8',
      'border-color': '#bfdcc9',
    },
  },
  {
    selector: 'node[type = "trigger_webhook_event"]',
    style: {
      'background-color': '#f5fbfc',
      'border-color': '#bddddd',
    },
  },
  {
    selector: 'node[type = "trigger_schedule_event"]',
    style: {
      'background-color': '#fefbf3',
      'border-color': '#ebd6ad',
    },
  },
  {
    selector: 'node[kind = "action"]',
    style: {
      'background-color': '#f7f9ff',
      'border-color': '#c4d5f3',
    },
  },
  {
    selector: 'node[kind = "decision"]',
    style: {
      'background-color': '#faf8ff',
      'border-color': '#d8cdf0',
    },
  },
  {
    selector: 'node[kind = "success"]',
    style: {
      'background-color': '#fffaf5',
      'border-color': '#edd8bb',
    },
  },
  {
    selector: 'node.hovered',
    style: {
      width: BASE_NODE_WIDTH,
      height: BASE_NODE_HEIGHT,
      'border-width': 1.15,
      'border-color': '#a8bfd8',
      'outline-width': 1.2,
      'outline-offset': 1,
      'outline-color': '#dce8f4',
    },
  },
  {
    selector: 'node[helper = "adder"]',
    style: {
      label: '+',
      shape: 'round-rectangle',
      width: 40,
      height: 40,
      color: '#415a76',
      'font-size': 26,
      'font-weight': 600,
      'font-family': 'Segoe UI, Arial, sans-serif',
      'text-valign': 'center',
      'text-halign': 'center',
      'text-justification': 'center',
      'text-wrap': 'none',
      'text-margin-x': 0,
      'text-margin-y': -1,
      'line-height': 1,
      'text-max-width': '40px',
      'text-background-opacity': 0,
      'background-color': '#ffffff',
      'border-width': 1.3,
      'border-color': '#bccddd',
      'outline-width': 0,
      'background-fill': 'solid',
      'overlay-opacity': 0,
    },
  },
  {
    selector: 'node[helper = "adder"]:grabbed',
    style: {
      'background-color': '#f4f8ff',
      'border-color': '#8da7c2',
      color: '#2c4767',
      'outline-width': 1.6,
      'outline-color': '#dbe7f4',
    },
  },
  {
    selector: 'edge',
    style: {
      width: 3,
      'curve-style': 'bezier',
      'control-point-step-size': 66,
      'line-style': 'solid',
      'line-color': '#4b5d72',
      'line-opacity': 1,
      'line-outline-width': 0,
      'line-outline-color': '#000000',
      'target-arrow-color': '#4b5d72',
      'target-arrow-shape': 'triangle',
      'target-arrow-fill': 'filled',
      'source-distance-from-node': 4,
      'target-distance-from-node': 6,
      'arrow-scale': 1.45,
      'line-cap': 'butt',
      'overlay-opacity': 0,
      'transition-property':
        'line-color target-arrow-color line-style width line-dash-offset opacity',
      'transition-duration': 160,
      'transition-timing-function': 'ease-out',
    },
  },
  {
    selector: 'edge[kind = "trigger"]',
    style: {
      'line-color': '#4D9D75',
      'target-arrow-color': '#4D9D75',
    },
  },
  {
    selector: 'edge[kind = "action"]',
    style: {
      'line-color': '#4369A5',
      'target-arrow-color': '#4369A5',
    },
  },
  {
    selector: 'edge[kind = "decision"]',
    style: {
      'line-style': 'dashed',
      'line-dash-pattern': [9, 6],
      'line-color': '#7555C2',
      'target-arrow-color': '#7555C2',
    },
  },
  {
    selector: 'edge[kind = "success"]',
    style: {
      'line-color': '#CF8522',
      'target-arrow-color': '#CF8522',
    },
  },
  {
    selector: 'edge.hovered',
    style: {
      width: 4,
      'line-color': '#27364a',
      'target-arrow-color': '#27364a',
    },
  },
  {
    selector: 'edge[helper = "adder"]',
    style: {
      width: 1.7,
      'curve-style': 'straight',
      'line-style': 'dashed',
      'line-dash-pattern': [6, 5],
      'line-color': '#9db1c6',
      'target-arrow-color': '#9db1c6',
      'target-arrow-shape': 'triangle',
      'arrow-scale': 0.9,
      'line-outline-width': 0,
      'line-outline-color': '#000000',
      'line-opacity': 0.88,
    },
  },
  {
    selector: 'node:selected',
    style: {
      'border-color': '#2d6cdf',
      'border-width': 1.3,
      'outline-width': 2.4,
      'outline-offset': 2,
      'outline-color': '#d7e6ff',
    },
  },
  {
    selector: 'edge:selected',
    style: {
      width: 4.2,
      'line-fill': 'solid',
      'line-color': '#2d6cdf',
      'line-outline-width': 0,
      'line-outline-color': '#000000',
      'target-arrow-color': '#2d6cdf',
      'line-style': 'solid',
      'line-dash-pattern': [1, 0],
      'target-arrow-shape': 'triangle',
      'arrow-scale': 1.45,
    },
  },
  {
    selector: 'edge:selected[kind = "decision"]',
    style: {
      'line-style': 'dashed',
      'line-dash-pattern': [9, 5],
      'line-color': '#7f5dd5',
      'target-arrow-color': '#7f5dd5',
      'line-outline-color': '#000000',
      'line-fill': 'solid',
      width: 4.2,
    },
  },
  {
    selector: 'edge:selected[kind = "success"]',
    style: {
      'line-color': '#e2942a',
      'target-arrow-color': '#e2942a',
      'line-outline-color': '#000000',
      'line-fill': 'solid',
      width: 4.2,
    },
  },
  {
    selector: 'edge:selected[kind = "trigger"]',
    style: {
      'line-color': '#359565',
      'target-arrow-color': '#359565',
      'line-outline-color': '#000000',
      'line-fill': 'solid',
      width: 4.2,
    },
  },
  {
    selector: 'edge:selected[kind = "action"]',
    style: {
      'line-color': '#2b64d8',
      'target-arrow-color': '#2b64d8',
      'line-outline-color': '#000000',
      'line-fill': 'solid',
      width: 4.2,
    },
  },
  {
    selector: 'edge.executing',
    style: {
      width: 4,
      'line-style': 'dashed',
      'line-dash-pattern': [11, 7],
      'line-dash-offset': 20,
      'line-color': '#2b64d8',
      'target-arrow-color': '#2b64d8',
    },
  },
];
