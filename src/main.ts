import { createScene } from './scene/scene';

const container = document.getElementById('app');
if (!container) throw new Error('#app container not found');

createScene(container);
