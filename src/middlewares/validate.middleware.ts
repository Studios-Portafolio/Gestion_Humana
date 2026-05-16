import { Request, Response, NextFunction } from 'express';
import { AnyZodObject, ZodError } from 'zod';

export const validateSchema = (schema: AnyZodObject) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      // Intentamos validar los datos contra la regla estricta de Zod
      schema.parse({
        body: req.body,
        query: req.query,
        params: req.params,
      });
      // Si pasa la validación, dejamos que la petición continúe
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        // Si hay error, bloqueamos la petición inmediatamente (Cero Trust)
        res.status(400).json({
          error: 'Datos de entrada bloqueados por el Firewall de Validación.',
          details: error.errors.map(e => ({ 
            campo: e.path[1], // Extraemos el nombre del campo que falló
            mensaje: e.message 
          }))
        });
        return;
      }
      res.status(500).json({ error: 'Error interno de validación' });
      return;
    }
  };
};