// Array to store all circles
let circles = [];
const speed = 200; // how fast it moves per push
const gravity = 2; // gravity strength
const bounceForce = 5;
const sizeMax = 175;
const sizeMin = 30;
const startingCircles = 10

let mousePos = { x: window.innerWidth / 2, y: window.innerHeight / 2 };

// Create initial circle
for (var i = 0; i<startingCircles; i++){
  createCircle();
}


// Function to generate random color
function getRandomColor() {
  const colors = [
    '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
    '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9',
    '#F8C471', '#82E0AA', '#F1948A', '#85C1E9', '#D7BDE2'
  ];
  return colors[Math.floor(Math.random() * colors.length)];
}

// Function to create a new circle
function createCircle() {
  const circle = document.createElement('div');
  const size = Math.random() * (sizeMax - sizeMin) + sizeMin; // Random size between 50px and 300px
  
  circle.style.width = size + 'px';
  circle.style.height = size + 'px';
  circle.style.background = getRandomColor();
  circle.style.borderRadius = '50%';
  circle.style.position = 'absolute';
  circle.style.transition = 'transform 0.05s linear';
  
  // Random position (accounting for circle size)
  const pos = {
    x: Math.random() * (window.innerWidth - size) + size / 2,
    y: Math.random() * (window.innerHeight - size) + size / 2
  };
  
  circle.style.left = pos.x + 'px';
  circle.style.top = pos.y + 'px';
  circle.style.transform = 'translate(-50%, -50%)';
  
  document.body.appendChild(circle);
  
  // Add to circles array with velocity and size for collisions
  circles.push({ 
    element: circle, 
    pos: pos, 
    velocity: { x: 0, y: 0 },
    size: size
  });
}

// Function to remove a random circle
function removeCircle() {
  if (circles.length > 0) {
    const randomIndex = Math.floor(Math.random() * circles.length);
    const circleToRemove = circles[randomIndex];
    document.body.removeChild(circleToRemove.element);
    circles.splice(randomIndex, 1);
  }
}

// Track mouse position
document.addEventListener('mousemove', (e) => {
  mousePos.x = e.clientX;
  mousePos.y = e.clientY;
});

// Keyboard controls
document.addEventListener('keydown', (e) => {
  if (e.key === '=' || e.key === '+') {
    for (var i = 0; i<1; i++){
      createCircle();
    }
    
  } else if (e.key === '-') {
    for (var i = 0; i<1; i++){
      removeCircle();
    }
  }
});

// Function to check collision between two circles
function checkCollision(circle1, circle2) {
  const dx = circle1.pos.x - circle2.pos.x;
  const dy = circle1.pos.y - circle2.pos.y;
  const distance = Math.sqrt(dx * dx + dy * dy);
  const combinedRadius = (circle1.size + circle2.size) / 2;
  return distance < combinedRadius; // Two circles collide when distance < combined radius
}

// Function to handle collision between two circles
function handleCollision(circle1, circle2) {
  const dx = circle1.pos.x - circle2.pos.x;
  const dy = circle1.pos.y - circle2.pos.y;
  const distance = Math.sqrt(dx * dx + dy * dy);
  const combinedRadius = (circle1.size + circle2.size) / 2;
  
  if (distance < combinedRadius && distance > 0) {
    // Normalize collision vector
    const nx = dx / distance;
    const ny = dy / distance;
    
    // Separate circles to prevent overlap
    const overlap = combinedRadius - distance;
    const separateX = nx * overlap * 0.5;
    const separateY = ny * overlap * 0.5;
    
    circle1.pos.x += separateX;
    circle1.pos.y += separateY;
    circle2.pos.x -= separateX;
    circle2.pos.y -= separateY;
    
    // Simple elastic collision response (reduced bounce)
    circle1.velocity.x += nx * bounceForce;
    circle1.velocity.y += ny * bounceForce;
    circle2.velocity.x -= nx * bounceForce;
    circle2.velocity.y -= ny * bounceForce;
  }
}

// Animation loop for all circles
function animate() {
  circles.forEach((circle, i) => {
    // Apply gravity
    circle.velocity.y += gravity * 0.5;
    
    // Calculate distance from mouse to circle center
    const dx = mousePos.x - circle.pos.x;
    const dy = mousePos.y - circle.pos.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    // If mouse is inside circle, push it away
    if (distance < circle.size / 2) {
      const angle = Math.atan2(dy, dx);
      circle.velocity.x -= Math.cos(angle) * speed * 0.3;
      circle.velocity.y -= Math.sin(angle) * speed * 0.3;
    }
    
    // Apply velocity
    circle.pos.x += circle.velocity.x;
    circle.pos.y += circle.velocity.y;
    
    // Apply friction (much stronger to settle quickly)
    circle.velocity.x *= 0.85;
    circle.velocity.y *= 0.85;
    
    // Stop very slow movement to prevent endless tiny bouncing
    if (Math.abs(circle.velocity.x) < 0.1) circle.velocity.x = 0;
    if (Math.abs(circle.velocity.y) < 0.1) circle.velocity.y = 0;
    
    // Bounce off walls (less bouncy)
    if (circle.pos.x <= circle.size / 2) {
      circle.pos.x = circle.size / 2;
      circle.velocity.x *= -0.3;
    }
    if (circle.pos.x >= window.innerWidth - circle.size / 2) {
      circle.pos.x = window.innerWidth - circle.size / 2;
      circle.velocity.x *= -0.3;
    }
    if (circle.pos.y <= circle.size / 2) {
      circle.pos.y = circle.size / 2;
      circle.velocity.y *= -0.3;
    }
    if (circle.pos.y >= window.innerHeight - circle.size / 2) {
      circle.pos.y = window.innerHeight - circle.size / 2;
      circle.velocity.y *= -0.3;
    }
    
    // Check collisions with other circles
    for (let j = i + 1; j < circles.length; j++) {
      if (checkCollision(circle, circles[j])) {
        handleCollision(circle, circles[j]);
      }
    }
    
    // Update position
    circle.element.style.left = `${circle.pos.x}px`;
    circle.element.style.top = `${circle.pos.y}px`;
  });
  
  requestAnimationFrame(animate);
}
animate(); // Start the animation