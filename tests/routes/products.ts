import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { db } from "../db"; 
import { FlowManager } from '../../../flow-engine/core/FlowManager.js'; // Assuming your FlowManager is here
import { NodeRegistry } from '../../../flow-engine/core/NodeRegistry.js'; // For direct use if needed
// Create router instance for product endpoints
const productRoutes = new Hono();

// Schema for product creation/update
const productSchema = z.object({
  name: z.string().min(2),
  price: z.number().positive(),
  description: z.string().optional(),
  inStock: z.boolean().default(true)
});

// GET all products
productRoutes.get('/', async (c) => {
  // In a real app, this would fetch from a database
  return c.json({
    products: [
      { id: 1, name: 'Laptop', price: 999.99, inStock: true },
      { id: 2, name: 'Phone', price: 699.99, inStock: false }
    ]
  });
});



productRoutes.get('/testflow', async (c) => {

	try {

    const scope = NodeRegistry.getScope();
    scope['Test something']= function() {
        console.log("Test something called!");
        return {
          pass:() => {return 'Narcis'}
        };
    };
    scope['Log input']= function() {
        console.log("Input",this.input);
        let input = this.input
        return {
          pass:() => {return input}
        };
    };
    scope['Concatenate with']= function(params){
      let input = this.input
      return {
        pass:() => {return input + params.text}
      };
    };
    const fm = FlowManager({
        initialState: { myText: "This is great!" ,messages:['????','!!!!!!!!!!!!!!']},
        nodes: [
          'Test something', // Custom node
          {'pass':[{'Concatenate with':{'text':' is awesome'}},{'Concatenate with':{'text':'${messages[1]}'}}]}, // Custom node
          'Log input', // Custom node
             /* { 
              "Connect to Gmail Account": {
                "email": "smupitesti2001@gmail.com",
              }
            },
            { 
                          "success": {"List Gmail Emails":{"getFullDetails":true}},



                          "error": { "utils.debug.logMessage": { "message": "ERROR connecting gmail...", "level": "warn" } }
            },
            {
              "List Google Drive Files": {
                         
                            "query": "trashed = false",

                            "maxResults": 5
              }
            },

                {
                    "success": {
                         "utils.debug.logMessage": { "message": "Successfully listed Drive files!", "level": "info" } 
                    },
                    "no_results": {
                        "utils.debug.logMessage": { "message": "No files found in Google Drive.", "level": "info" } 
                    },
                    "auth_error": {
                        "utils.debug.logMessage": { "message": "Authentication error with Google Drive.", "level": "error" } 
                    }
                },
         { 
            'Upload File to Google Drive': {
                                "fileName": "test.txt",
                                "fileContent": "This is a test file content!!!",
                                "mimeType": "text/plain"
                              } 
            }    */
        ],
        scope
    });

    try {
        const result = await fm.run();     //COMINg SOON!!!!!!
       // console.log("Flow completed. Final state:", fm.getStateManager().getState());
      //   console.log("Flow steps:", result);   
    } catch (e) {
        console.error("Flow execution error:", e);
    }
    

    return c.json({}, 200);
	} catch (error: any) {
		console.error("Error :", error);
		
	}
});

productRoutes.get('/:id', async (c) => {
  const id = c.req.param('id');
  
  // In a real app, this would fetch from a database
  return c.json({
    product: { id: parseInt(id), name: 'Laptop', price: 999.99, inStock: true }
  });
});

// POST create a new product
productRoutes.post('/', zValidator('json', productSchema), async (c) => {
  const productData = c.req.valid('json');
  
  // In a real app, this would save to a database
  return c.json({
    message: 'Product created successfully',
    product: { id: 3, ...productData }
  }, 201);
});

// PUT update an existing product
productRoutes.put('/:id', zValidator('json', productSchema), async (c) => {
  const id = c.req.param('id');
  const productData = c.req.valid('json');
  
  // In a real app, this would update in a database
  return c.json({
    message: 'Product updated successfully',
    product: { id: parseInt(id), ...productData }
  });
});

// DELETE a product
productRoutes.delete('/:id', async (c) => {
  const id = c.req.param('id');
  
  // In a real app, this would delete from a database
  return c.json({
    message: `Product with ID ${id} deleted successfully`
  });
});

export { productRoutes };