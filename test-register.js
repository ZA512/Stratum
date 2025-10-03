const registerUrl = 'http://localhost:4001/api/v1/auth/register';
const loginUrl = 'http://localhost:4001/api/v1/auth/login';

const testData = {
  email: 'test@example.com',
  password: 'password123',
  displayName: 'Test User'
};

console.log('🧪 Test de la route d\'inscription...');

// Test register
fetch(registerUrl, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(testData)
})
.then(response => {
  console.log(`📡 Statut de l'inscription: ${response.status}`);
  return response.json();
})
.then(data => {
  console.log('✅ Réponse de l\'inscription:', data);
  console.log('🔄 Test de connexion...');
  
  // Test login avec les mêmes credentials
  return fetch(loginUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email: testData.email,
      password: testData.password
    })
  });
})
.then(response => {
  console.log(`📡 Statut de la connexion: ${response.status}`);
  return response.json();
})
.then(data => {
  console.log('✅ Réponse de la connexion:', data);
})
.catch(error => {
  console.error('❌ Erreur:', error.message);
});