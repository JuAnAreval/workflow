declare module 'cytoscape-node-html-label' {
  import cytoscape from 'cytoscape';

  const register: (cy: typeof cytoscape) => void;
  export default register;
}
