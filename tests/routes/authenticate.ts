import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { jwt } from 'hono/jwt';

// Create router instance for auth endpoints
const authRoutes = new Hono();

// Secret key for JWT (in a real app, store this in environment variables)
const JWT_SECRET = 'your-jwt-secret-key';

// Add JWT middleware to protected routes
const jwtMiddleware = jwt({ secret: JWT_SECRET });

// Login schema
const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6)
});

// Register schema
const registerSchema = z.object({
  name: z.string().min(3),
  email: z.string().email(),
  password: z.string().min(6)
});

// Login endpoint
authRoutes.post('/login', zValidator('json', loginSchema), async (c) => {
  const { email, password } = c.req.valid('json');
  
  // In a real app, verify credentials against a database
  if (email === 'user@example.com' && password === 'password123') {
    // Generate JWT token
    const token = await generateToken({ userId: 1, email });
    
    return c.json({
      message: 'Login successful',
      token
    });
  }
  
  return c.json({ message: 'Invalid credentials' }, 401);
});

// Register endpoint
authRoutes.post('/register', zValidator('json', registerSchema), async (c) => {
  const userData = c.req.valid('json');
  
  // In a real app, save user to database
  // For demo, just return success
  return c.json({
    message: 'Registration successful',
    user: { id: 999, name: userData.name, email: userData.email }
  }, 201);
});

// Protected route example
authRoutes.get('/me', jwtMiddleware, async (c) => {
  // JWT middleware adds payload to context
  const payload = c.get('jwtPayload');
  
  return c.json({
    message: 'Protected route accessed successfully',
    user: payload
  });
});

// Logout endpoint
authRoutes.post('/logout', async (c) => {
  // In a real app with session management, you'd invalidate the token
  return c.json({
    message: 'Logged out successfully'
  });
});

// Helper function to generate JWT token
async function generateToken(payload: any): Promise<string> {
  // In a real app, use a proper JWT library
  // This is a simplified example
  return `dummy-jwt-token-for-${payload.email}`;
}

export { authRoutes };