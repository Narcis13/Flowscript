import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';

// Create router instance for user endpoints
const userRoutes = new Hono();

// Schema for user creation
const userSchema = z.object({
  name: z.string().min(3),
  email: z.string().email(),
  age: z.number().int().positive().optional()
});

// GET all users
userRoutes.get('/', async (c) => {
  // In a real app, this would fetch from a database
  return c.json({
    users: [
      { id: 1, name: 'John Doe', email: 'john@example.com' },
      { id: 2, name: 'Jane Smith', email: 'jane@example.com' }
    ]
  });
});

// GET a specific user
userRoutes.get('/:id', async (c) => {
  const id = c.req.param('id');
  
  // In a real app, this would fetch from a database
  return c.json({
    user: { id: parseInt(id), name: 'John Doe', email: 'john@example.com' }
  });
});

// POST create a new user
userRoutes.post('/', zValidator('json', userSchema), async (c) => {
  const userData = c.req.valid('json');
  
  // In a real app, this would save to a database
  return c.json({
    message: 'User created successfully',
    user: { id: 3, ...userData }
  }, 201);
});

// PUT update an existing user
userRoutes.put('/:id', zValidator('json', userSchema), async (c) => {
  const id = c.req.param('id');
  const userData = c.req.valid('json');
  
  // In a real app, this would update in a database
  return c.json({
    message: 'User updated successfully',
    user: { id: parseInt(id), ...userData }
  });
});

// DELETE a user
userRoutes.delete('/:id', async (c) => {
  const id = c.req.param('id');
  
  // In a real app, this would delete from a database
  return c.json({
    message: `User with ID ${id} deleted successfully`
  });
});

export { userRoutes };