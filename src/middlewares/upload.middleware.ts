import multer from 'multer';

// Procesamos el archivo en memoria (Buffer) por velocidad y seguridad (Zero Trust)
// Así la foto de la cédula no se queda guardada físicamente en el servidor
const storage = multer.memoryStorage();

export const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // Límite estricto de 5MB por imagen
  },
  fileFilter: (req, file, cb) => {
    // Solo permitimos imágenes y PDFs
    if (file.mimetype.startsWith('image/') || file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Formato no soportado. Solo imágenes o PDFs.'));
    }
  }
});