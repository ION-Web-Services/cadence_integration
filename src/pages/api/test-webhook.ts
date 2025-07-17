import type { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  console.log('Test endpoint called with method:', req.method);
  
  if (req.method === 'POST') {
    return res.status(200).json({ 
      success: true, 
      message: 'Test endpoint working',
      method: req.method,
      body: req.body 
    });
  }
  
  return res.status(405).json({ error: 'Method not allowed', method: req.method });
} 