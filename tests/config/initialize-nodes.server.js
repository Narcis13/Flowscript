// src/config/initialize-nodes.server.js
import { NodeRegistry } from '../../../flow-engine/core/NodeRegistry'; // Note .js extension for explicit Bun import
import { Glob } from 'bun';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Helper to get directory name in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function initializeServerNodeRegistry() {
    // Adjust path to be relative to this file, then go up and into flow-engine/nodes
    const nodesBasePath = path.resolve(__dirname, '../../../flow-engine/nodes');
    const glob = new Glob('**/*.node.js');

    console.log(`[NodeRegistryLoader-Bun] Scanning for node modules in: ${nodesBasePath}`);
    let registeredCount = 0;

    for await (const relativeFilePath of glob.scan(nodesBasePath)) {
        const fullPath = path.join(nodesBasePath, relativeFilePath);
        try {
            // Bun requires the path to be relative to project root or absolute for dynamic import.
            // Or ensure your tsconfig/jsconfig paths allow this resolution if using aliases.
            // For simplicity, we use the absolute path.
            const module = await import(fullPath);

            if (module.default) {
                const nodeDefinition = module.default;

                if (!nodeDefinition.id) {
                    let generatedId = relativeFilePath
                        .replace('.node.js', '')
                        .replace(/\\/g, '/') // Normalize slashes for Windows paths
                        .replace(/\//g, '.');
                    console.warn(`[NodeRegistryLoader-Bun] Node from ${relativeFilePath} missing 'id'. Generating as '${generatedId}'. Consider adding an explicit id for stability.`);
                    nodeDefinition.id = generatedId;
                }
                nodeDefinition._sourcePath = relativeFilePath;
                NodeRegistry.register(nodeDefinition);
                registeredCount++;
            } else {
                console.warn(`[NodeRegistryLoader-Bun] No default export found in ${fullPath}. Skipping.`);
            }
        } catch (error) {
            console.error(`[NodeRegistryLoader-Bun] Error loading or registering node from ${fullPath}:`, error);
        }
    }
    console.log(`[NodeRegistryLoader-Bun] Node registration complete. ${registeredCount} nodes registered. Total in registry: ${NodeRegistry.getAll().length}`);
}