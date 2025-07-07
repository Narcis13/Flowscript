import { Hono } from 'hono';
import { userRoutes } from './users';
import { productRoutes } from './products';
import { authRoutes } from './authenticate';
import { googleAuthRoutes } from './google-auth'; 
// Create a new Hono instance for all routes
const routes = new Hono();

// Mount each module's routes
routes.route('/users', userRoutes);
routes.route('/products', productRoutes);
routes.route('/authenticate', authRoutes);
routes.route('/auth', googleAuthRoutes);
export { routes };