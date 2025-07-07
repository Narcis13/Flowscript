/**
 * JSON Schema Form Generator for HITL
 * Generates dynamic forms based on JSON Schema definitions
 */

document.addEventListener('alpine:init', () => {
    // Form Generator Component
    Alpine.data('formGenerator', () => ({
        schema: null,
        uiSchema: {},
        formData: {},
        errors: {},
        
        // Initialize form with schema
        init(schema = null, uiSchema = {}, initialData = {}) {
            if (schema) {
                this.schema = schema;
                this.uiSchema = uiSchema;
                this.formData = this.initializeFormData(schema, initialData);
                this.errors = {};
            }
        },
        
        // Initialize form data based on schema
        initializeFormData(schema, initialData = {}) {
            const data = { ...initialData };
            
            if (schema.type === 'object' && schema.properties) {
                Object.keys(schema.properties).forEach(key => {
                    if (!(key in data)) {
                        const prop = schema.properties[key];
                        data[key] = this.getDefaultValue(prop);
                    }
                });
            }
            
            return data;
        },
        
        // Get default value for a schema property
        getDefaultValue(schema) {
            if (schema.default !== undefined) {
                return schema.default;
            }
            
            switch (schema.type) {
                case 'string':
                    return '';
                case 'number':
                case 'integer':
                    return 0;
                case 'boolean':
                    return false;
                case 'array':
                    return [];
                case 'object':
                    return {};
                default:
                    return null;
            }
        },
        
        // Generate form HTML
        generateForm(schema = null, path = '') {
            schema = schema || this.schema;
            if (!schema) return '';
            
            switch (schema.type) {
                case 'object':
                    return this.generateObjectForm(schema, path);
                case 'array':
                    return this.generateArrayForm(schema, path);
                default:
                    return this.generateField(schema, path);
            }
        },
        
        // Generate object form
        generateObjectForm(schema, path) {
            let html = '';
            
            if (schema.properties) {
                Object.keys(schema.properties).forEach(key => {
                    const propertyPath = path ? `${path}.${key}` : key;
                    const property = schema.properties[key];
                    const required = schema.required && schema.required.includes(key);
                    
                    html += `
                        <div class="field">
                            ${this.generateField(property, propertyPath, required)}
                        </div>
                    `;
                });
            }
            
            return html;
        },
        
        // Generate array form
        generateArrayForm(schema, path) {
            const items = this.getValueByPath(path) || [];
            let html = `
                <div class="array-field" x-data="{ items: ${JSON.stringify(items)} }">
                    <label class="label">${schema.title || path}</label>
                    <template x-for="(item, index) in items" :key="index">
                        <div class="box mb-2">
                            <button type="button" class="delete is-pulled-right" @click="items.splice(index, 1)"></button>
                            ${this.generateField(schema.items, `${path}[index]`, false)}
                        </div>
                    </template>
                    <button type="button" class="button is-small is-primary" @click="items.push(${JSON.stringify(this.getDefaultValue(schema.items))})">
                        <span class="icon">
                            <i class="fas fa-plus"></i>
                        </span>
                        <span>Add Item</span>
                    </button>
                </div>
            `;
            return html;
        },
        
        // Generate individual field
        generateField(schema, path, required = false) {
            const fieldId = `field-${path.replace(/\./g, '-')}`;
            const value = this.getValueByPath(path);
            const error = this.errors[path];
            const uiOptions = this.getUIOptions(path);
            
            let html = '';
            
            // Label
            if (schema.title) {
                html += `
                    <label class="label" for="${fieldId}">
                        ${schema.title}
                        ${required ? '<span class="has-text-danger">*</span>' : ''}
                    </label>
                `;
            }
            
            // Field based on type
            switch (schema.type) {
                case 'string':
                    html += this.generateStringField(schema, fieldId, path, value, uiOptions);
                    break;
                case 'number':
                case 'integer':
                    html += this.generateNumberField(schema, fieldId, path, value, uiOptions);
                    break;
                case 'boolean':
                    html += this.generateBooleanField(schema, fieldId, path, value, uiOptions);
                    break;
                case 'object':
                    return this.generateObjectForm(schema, path);
                case 'array':
                    return this.generateArrayForm(schema, path);
                default:
                    html += this.generateDefaultField(schema, fieldId, path, value);
            }
            
            // Description
            if (schema.description) {
                html += `<p class="help">${schema.description}</p>`;
            }
            
            // Error message
            if (error) {
                html += `<p class="help is-danger">${error}</p>`;
            }
            
            return html;
        },
        
        // Generate string field
        generateStringField(schema, fieldId, path, value, uiOptions) {
            const modelPath = `$store.hitlForm.formData.${path}`;
            
            // Check for enum (select dropdown)
            if (schema.enum) {
                return `
                    <div class="select ${uiOptions.fullwidth ? 'is-fullwidth' : ''}">
                        <select id="${fieldId}" x-model="${modelPath}">
                            <option value="">Select...</option>
                            ${schema.enum.map(option => `
                                <option value="${option}" ${value === option ? 'selected' : ''}>
                                    ${schema.enumNames ? schema.enumNames[schema.enum.indexOf(option)] : option}
                                </option>
                            `).join('')}
                        </select>
                    </div>
                `;
            }
            
            // Check for textarea
            if (uiOptions.widget === 'textarea' || schema.format === 'textarea') {
                return `
                    <div class="control">
                        <textarea 
                            id="${fieldId}" 
                            class="textarea" 
                            x-model="${modelPath}"
                            placeholder="${schema.placeholder || ''}"
                            ${schema.minLength ? `minlength="${schema.minLength}"` : ''}
                            ${schema.maxLength ? `maxlength="${schema.maxLength}"` : ''}
                        ></textarea>
                    </div>
                `;
            }
            
            // Default text input
            return `
                <div class="control">
                    <input 
                        id="${fieldId}" 
                        type="${this.getInputType(schema)}" 
                        class="input" 
                        x-model="${modelPath}"
                        placeholder="${schema.placeholder || ''}"
                        ${schema.minLength ? `minlength="${schema.minLength}"` : ''}
                        ${schema.maxLength ? `maxlength="${schema.maxLength}"` : ''}
                        ${schema.pattern ? `pattern="${schema.pattern}"` : ''}
                    />
                </div>
            `;
        },
        
        // Generate number field
        generateNumberField(schema, fieldId, path, value, uiOptions) {
            const modelPath = `$store.hitlForm.formData.${path}`;
            
            // Check for range slider
            if (uiOptions.widget === 'range' || schema.format === 'range') {
                return `
                    <div class="control">
                        <input 
                            id="${fieldId}" 
                            type="range" 
                            class="slider is-fullwidth" 
                            x-model.number="${modelPath}"
                            ${schema.minimum !== undefined ? `min="${schema.minimum}"` : ''}
                            ${schema.maximum !== undefined ? `max="${schema.maximum}"` : ''}
                            ${schema.multipleOf ? `step="${schema.multipleOf}"` : ''}
                        />
                        <span x-text="${modelPath}"></span>
                    </div>
                `;
            }
            
            // Default number input
            return `
                <div class="control">
                    <input 
                        id="${fieldId}" 
                        type="number" 
                        class="input" 
                        x-model.number="${modelPath}"
                        placeholder="${schema.placeholder || ''}"
                        ${schema.minimum !== undefined ? `min="${schema.minimum}"` : ''}
                        ${schema.maximum !== undefined ? `max="${schema.maximum}"` : ''}
                        ${schema.multipleOf ? `step="${schema.multipleOf}"` : ''}
                    />
                </div>
            `;
        },
        
        // Generate boolean field
        generateBooleanField(schema, fieldId, path, value, uiOptions) {
            const modelPath = `$store.hitlForm.formData.${path}`;
            
            // Check for switch style
            if (uiOptions.widget === 'switch') {
                return `
                    <div class="field">
                        <input 
                            id="${fieldId}" 
                            type="checkbox" 
                            class="switch" 
                            x-model="${modelPath}"
                        />
                        <label for="${fieldId}">${schema.title || path}</label>
                    </div>
                `;
            }
            
            // Default checkbox
            return `
                <div class="control">
                    <label class="checkbox">
                        <input 
                            id="${fieldId}" 
                            type="checkbox" 
                            x-model="${modelPath}"
                        />
                        ${schema.title || path}
                    </label>
                </div>
            `;
        },
        
        // Generate default field
        generateDefaultField(schema, fieldId, path, value) {
            const modelPath = `$store.hitlForm.formData.${path}`;
            return `
                <div class="control">
                    <input 
                        id="${fieldId}" 
                        type="text" 
                        class="input" 
                        x-model="${modelPath}"
                        placeholder="${schema.placeholder || ''}"
                    />
                </div>
            `;
        },
        
        // Get input type based on format
        getInputType(schema) {
            switch (schema.format) {
                case 'email':
                    return 'email';
                case 'uri':
                case 'url':
                    return 'url';
                case 'date':
                    return 'date';
                case 'time':
                    return 'time';
                case 'date-time':
                    return 'datetime-local';
                case 'password':
                    return 'password';
                case 'color':
                    return 'color';
                default:
                    return 'text';
            }
        },
        
        // Get UI options for a path
        getUIOptions(path) {
            const options = {};
            
            if (this.uiSchema[path]) {
                Object.assign(options, this.uiSchema[path]);
            }
            
            // Check nested paths
            const parts = path.split('.');
            let currentPath = '';
            parts.forEach(part => {
                currentPath = currentPath ? `${currentPath}.${part}` : part;
                if (this.uiSchema[currentPath]) {
                    Object.assign(options, this.uiSchema[currentPath]);
                }
            });
            
            return options;
        },
        
        // Get value by path
        getValueByPath(path) {
            const parts = path.split('.');
            let value = this.formData;
            
            for (const part of parts) {
                if (value && typeof value === 'object' && part in value) {
                    value = value[part];
                } else {
                    return undefined;
                }
            }
            
            return value;
        },
        
        // Set value by path
        setValueByPath(path, value) {
            const parts = path.split('.');
            let obj = this.formData;
            
            for (let i = 0; i < parts.length - 1; i++) {
                const part = parts[i];
                if (!(part in obj) || typeof obj[part] !== 'object') {
                    obj[part] = {};
                }
                obj = obj[part];
            }
            
            obj[parts[parts.length - 1]] = value;
        },
        
        // Validate form data
        validate() {
            this.errors = {};
            return this.validateSchema(this.schema, this.formData, '');
        },
        
        // Validate against schema
        validateSchema(schema, data, path) {
            let valid = true;
            
            if (!schema) return true;
            
            // Type validation
            if (schema.type && !this.validateType(data, schema.type)) {
                this.errors[path] = `Must be of type ${schema.type}`;
                return false;
            }
            
            // Required validation
            if (schema.required && schema.type === 'object') {
                schema.required.forEach(key => {
                    if (!(key in data) || data[key] === null || data[key] === '') {
                        const fieldPath = path ? `${path}.${key}` : key;
                        this.errors[fieldPath] = 'This field is required';
                        valid = false;
                    }
                });
            }
            
            // String validations
            if (schema.type === 'string' && typeof data === 'string') {
                if (schema.minLength && data.length < schema.minLength) {
                    this.errors[path] = `Must be at least ${schema.minLength} characters`;
                    valid = false;
                }
                if (schema.maxLength && data.length > schema.maxLength) {
                    this.errors[path] = `Must be at most ${schema.maxLength} characters`;
                    valid = false;
                }
                if (schema.pattern && !new RegExp(schema.pattern).test(data)) {
                    this.errors[path] = 'Invalid format';
                    valid = false;
                }
                if (schema.enum && !schema.enum.includes(data)) {
                    this.errors[path] = 'Invalid value';
                    valid = false;
                }
            }
            
            // Number validations
            if ((schema.type === 'number' || schema.type === 'integer') && typeof data === 'number') {
                if (schema.minimum !== undefined && data < schema.minimum) {
                    this.errors[path] = `Must be at least ${schema.minimum}`;
                    valid = false;
                }
                if (schema.maximum !== undefined && data > schema.maximum) {
                    this.errors[path] = `Must be at most ${schema.maximum}`;
                    valid = false;
                }
                if (schema.type === 'integer' && !Number.isInteger(data)) {
                    this.errors[path] = 'Must be an integer';
                    valid = false;
                }
            }
            
            // Object validations
            if (schema.type === 'object' && schema.properties && typeof data === 'object') {
                Object.keys(schema.properties).forEach(key => {
                    const fieldPath = path ? `${path}.${key}` : key;
                    if (!this.validateSchema(schema.properties[key], data[key], fieldPath)) {
                        valid = false;
                    }
                });
            }
            
            // Array validations
            if (schema.type === 'array' && Array.isArray(data)) {
                if (schema.minItems && data.length < schema.minItems) {
                    this.errors[path] = `Must have at least ${schema.minItems} items`;
                    valid = false;
                }
                if (schema.maxItems && data.length > schema.maxItems) {
                    this.errors[path] = `Must have at most ${schema.maxItems} items`;
                    valid = false;
                }
                if (schema.items) {
                    data.forEach((item, index) => {
                        const itemPath = `${path}[${index}]`;
                        if (!this.validateSchema(schema.items, item, itemPath)) {
                            valid = false;
                        }
                    });
                }
            }
            
            return valid;
        },
        
        // Validate type
        validateType(value, type) {
            switch (type) {
                case 'string':
                    return typeof value === 'string';
                case 'number':
                    return typeof value === 'number' && !isNaN(value);
                case 'integer':
                    return typeof value === 'number' && Number.isInteger(value);
                case 'boolean':
                    return typeof value === 'boolean';
                case 'array':
                    return Array.isArray(value);
                case 'object':
                    return value !== null && typeof value === 'object' && !Array.isArray(value);
                case 'null':
                    return value === null;
                default:
                    return true;
            }
        },
        
        // Submit form
        submit() {
            if (this.validate()) {
                return {
                    valid: true,
                    data: this.formData
                };
            } else {
                return {
                    valid: false,
                    errors: this.errors
                };
            }
        }
    }));
    
    // HITL Form Store
    Alpine.store('hitlForm', {
        schema: null,
        uiSchema: {},
        formData: {},
        errors: {},
        
        // Set form schema
        setSchema(schema, uiSchema = {}, initialData = {}) {
            this.schema = schema;
            this.uiSchema = uiSchema;
            this.formData = initialData;
            this.errors = {};
        }
    });
});

// Export utilities
window.FlowScriptFormGenerator = {
    // Generate form HTML from schema
    generateFormHTML(schema, uiSchema = {}, initialData = {}) {
        const generator = Alpine.data('formGenerator')();
        generator.init(schema, uiSchema, initialData);
        return generator.generateForm();
    },
    
    // Example schemas for testing
    examples: {
        simple: {
            type: 'object',
            title: 'Simple Form',
            properties: {
                name: {
                    type: 'string',
                    title: 'Name',
                    minLength: 2,
                    maxLength: 50
                },
                age: {
                    type: 'integer',
                    title: 'Age',
                    minimum: 0,
                    maximum: 150
                },
                email: {
                    type: 'string',
                    title: 'Email',
                    format: 'email'
                }
            },
            required: ['name', 'email']
        },
        
        approval: {
            type: 'object',
            title: 'Approval Form',
            properties: {
                decision: {
                    type: 'string',
                    title: 'Decision',
                    enum: ['approve', 'reject', 'request_info'],
                    enumNames: ['Approve', 'Reject', 'Request More Information']
                },
                comments: {
                    type: 'string',
                    title: 'Comments',
                    format: 'textarea'
                },
                priority: {
                    type: 'string',
                    title: 'Priority',
                    enum: ['low', 'medium', 'high'],
                    default: 'medium'
                }
            },
            required: ['decision']
        }
    }
};