// PEGA AQUÍ ADENTRO EL TOKEN NUEVO QUE ACABAS DE COPIAR:
const TOKEN = 'AQUI_PEGA_EL_NUEVO_TOKEN'; 

async function testAutoRegistration() {
  console.log('🚀 Iniciando flujo de Auto-Registro: Subida de ID + Creación de Perfil...');

  const formData = new FormData();
  const fakeImageBlob = new Blob(['{binary_data}'], { type: 'image/jpeg' });
  
  // Enviamos la "foto" y el correo del nuevo talento
  formData.append('document', fakeImageBlob, 'cedula_angel.jpg');
  formData.append('email', 'talento_nuevo@thefortress.dev'); 

  try {
    const response = await fetch('http://localhost:3000/api/ocr/process', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${TOKEN}`
      },
      body: formData 
    });

    const data = await response.json();

    if (response.ok) {
      console.log('\n✅ ¡EMPLEADO CREADO EN NEON AUTOMÁTICAMENTE!');
      console.log('--------------------------------------------------');
      console.log(`👤 Nombre extraído: ${data.employee.name}`);
      console.log(`📧 Correo asignado: ${data.employee.email}`);
      console.log(`🆔 ID en Sistema: ${data.employee.id}`);
      console.log('--------------------------------------------------');
    } else {
      console.error('\n❌ Error:', data);
    }
  } catch (error) {
    console.error('\n❌ Error de conexión al servidor.');
  }
}

testAutoRegistration();