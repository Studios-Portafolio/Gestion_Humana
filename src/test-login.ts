async function testLogin() {
  console.log('🔐 Iniciando prueba de Login Zero Trust...');

  try {
    const response = await fetch('http://localhost:3000/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email: 'angel@thefortress.dev'
      })
    });

    const data = await response.json();

    if (response.ok) {
      console.log('\n✅ ¡LOGIN EXITOSO!');
      console.log('-'.repeat(50));
      console.log(`👤 Usuario: ${data.user.fullName} (${data.user.role})`);
      console.log('🔑 Access Token (Cópialo si lo necesitas):');
      console.log(data.accessToken); // <-- Aquí estaba el cambio
      console.log('-'.repeat(50));
    } else {
      console.error('\n❌ Error de Login:', data);
    }
  } catch (error) {
    console.error('\n❌ Error de conexión:', error);
  }
}

testLogin();