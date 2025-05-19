import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { Camera, RotateCcw, Shield, ZapOff } from 'lucide-react';

// Game constants
const TANK_SPEED = 0.05;
const TANK_ROTATION_SPEED = 0.03;
const TURRET_ROTATION_SPEED = 0.05;
const PROJECTILE_SPEED = 0.2;
const COOLDOWN_TIME = 1200; // in ms
const ABILITY_COOLDOWN_TIME = 5000; // in ms
const DASH_COOLDOWN_TIME = 3000; // in ms
const DASH_SPEED_MULTIPLIER = 3;
const DASH_DURATION = 500; // in ms
const MIN_CAMERA_DISTANCE = 3;
const MAX_CAMERA_DISTANCE = 15;
const CAMERA_ZOOM_SPEED = 0.5;
const CAMERA_ROTATION_SPEED = 0.005;
const COLLISION_THRESHOLD = 1.0; // Minimum distance between objects
const PROJECTILE_DAMAGE = 20;
const ARENA_SIZE = 40;

// Tank class definitions
const TANK_CLASSES = {
  STRIKER: {
    name: 'Striker',
    speed: TANK_SPEED * 1.3,
    health: 80,
    color: '#4a9df0',
    ability: 'Deploy Mine',
    abilityIcon: <Camera className="w-6 h-6" />,
    mobilitySkill: 'Dash',
  },
  SENTINEL: {
    name: 'Sentinel',
    speed: TANK_SPEED,
    health: 100,
    color: '#45a562',
    ability: 'EMP Burst',
    abilityIcon: <ZapOff className="w-6 h-6" />,
    mobilitySkill: 'Shield',
  },
  JUGGERNAUT: {
    name: 'Juggernaut',
    speed: TANK_SPEED * 0.7,
    health: 150,
    color: '#c93838',
    ability: 'Ground Slam',
    abilityIcon: <RotateCcw className="w-6 h-6" />,
    mobilitySkill: 'Charge',
  }
};

export default function TankBlitzGame() {
  const containerRef = useRef(null);
  const requestRef = useRef(null);
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const rendererRef = useRef(null);
  const tankRef = useRef(null);
  const turretRef = useRef(null);
  const lastTimeRef = useRef(0);
  const projectilesRef = useRef([]);
  const keysRef = useRef({});
  const mousePositionRef = useRef({ x: 0, y: 0 });
  const cooldownRef = useRef(false);
  const abilityCooldownRef = useRef(false);
  const dashCooldownRef = useRef(false);
  const isDashingRef = useRef(false);
  const dashStartTimeRef = useRef(0);
  const cameraDistanceRef = useRef(5);
  const cameraRotationRef = useRef(0);
  const isRotatingRef = useRef(false);
  const lastMousePosRef = useRef({ x: 0, y: 0 });

  const [tankClass, setTankClass] = useState('STRIKER');
  const [health, setHealth] = useState(100);
  const [ammo, setAmmo] = useState(10);
  const [score, setScore] = useState(0);
  const [cooldown, setCooldown] = useState(false);
  const [abilityCooldown, setAbilityCooldown] = useState(false);
  const [dashCooldown, setDashCooldown] = useState(false);
  const [gameStarted, setGameStarted] = useState(false);
  const [showControls, setShowControls] = useState(false);

  // Initialize Three.js scene
  useEffect(() => {
    if (!gameStarted) return;

    // Setup scene, camera, and renderer
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x222233);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    camera.position.set(0, 5, 5);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    rendererRef.current = renderer;

    containerRef.current.appendChild(renderer.domElement);

    // Setup lighting
    const ambientLight = new THREE.AmbientLight(0x404040, 1);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(5, 10, 5);
    directionalLight.castShadow = true;
    directionalLight.shadow.camera.left = -ARENA_SIZE / 2;
    directionalLight.shadow.camera.right = ARENA_SIZE / 2;
    directionalLight.shadow.camera.top = ARENA_SIZE / 2;
    directionalLight.shadow.camera.bottom = -ARENA_SIZE / 2;
    directionalLight.shadow.camera.near = 0.1;
    directionalLight.shadow.camera.far = 100;
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;
    directionalLight.shadow.bias = -0.001;
    scene.add(directionalLight);

    // Create arena floor
    const floorGeometry = new THREE.PlaneGeometry(ARENA_SIZE, ARENA_SIZE);
    const floorMaterial = new THREE.MeshStandardMaterial({
      color: 0x333333,
      roughness: 0.8,
      metalness: 0.2,
    });
    const floor = new THREE.Mesh(floorGeometry, floorMaterial);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    // Create arena walls
    const wallMaterial = new THREE.MeshStandardMaterial({
      color: 0x555555,
      roughness: 0.7,
      metalness: 0.3,
    });

    // Create obstacles
    createObstacles(scene);

    // Create tank
    createTank(scene);

    // Handle window resize
    const handleResize = () => {
      cameraRef.current.aspect = window.innerWidth / window.innerHeight;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(window.innerWidth, window.innerHeight);
    };

    window.addEventListener('resize', handleResize);

    // Start game loop
    requestRef.current = requestAnimationFrame(gameLoop);

    // Setup event listeners
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mousedown', handleMouseDown);

    return () => {
      if (containerRef.current && rendererRef.current) {
        containerRef.current.removeChild(rendererRef.current.domElement);
      }
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mousedown', handleMouseDown);

      if (requestRef.current) {
        cancelAnimationFrame(requestRef.current);
      }
    };
  }, [gameStarted]);

  // Create tank
  const createTank = (scene) => {
    const tankBody = new THREE.Group();

    // Tank base
    const baseGeometry = new THREE.BoxGeometry(1, 0.5, 1.5);
    const baseMaterial = new THREE.MeshStandardMaterial({
      color: TANK_CLASSES[tankClass].color,
      roughness: 0.7,
      metalness: 0.3,
    });
    const base = new THREE.Mesh(baseGeometry, baseMaterial);
    base.position.y = 0.25;
    base.castShadow = true;
    tankBody.add(base);

    // Tank treads
    const treadGeometry = new THREE.BoxGeometry(1.2, 0.2, 1.8);
    const treadMaterial = new THREE.MeshStandardMaterial({
      color: 0x222222,
      roughness: 0.9,
      metalness: 0.1,
    });
    const treads = new THREE.Mesh(treadGeometry, treadMaterial);
    treads.position.y = 0.1;
    treads.castShadow = true;
    tankBody.add(treads);

    // Tank turret base
    const turretBaseGeometry = new THREE.CylinderGeometry(0.4, 0.4, 0.3, 8);
    const turretBaseMaterial = new THREE.MeshStandardMaterial({
      color: TANK_CLASSES[tankClass].color,
      roughness: 0.7,
      metalness: 0.3,
    });
    const turretBase = new THREE.Mesh(turretBaseGeometry, turretBaseMaterial);
    turretBase.position.y = 0.65;
    turretBase.castShadow = true;
    tankBody.add(turretBase);

    // Tank turret
    const turret = new THREE.Group();

    // Turret body
    const turretGeometry = new THREE.BoxGeometry(0.6, 0.3, 0.8);
    const turretMaterial = new THREE.MeshStandardMaterial({
      color: TANK_CLASSES[tankClass].color,
      roughness: 0.7,
      metalness: 0.3,
    });
    const turretBody = new THREE.Mesh(turretGeometry, turretMaterial);
    turretBody.position.y = 0.15;
    turretBody.castShadow = true;
    turret.add(turretBody);

    // Cannon
    const cannonGeometry = new THREE.CylinderGeometry(0.1, 0.1, 1, 8);
    const cannonMaterial = new THREE.MeshStandardMaterial({
      color: 0x333333,
      roughness: 0.5,
      metalness: 0.5,
    });
    const cannon = new THREE.Mesh(cannonGeometry, cannonMaterial);
    cannon.position.z = 0.5;
    cannon.rotation.x = Math.PI / 2;
    cannon.castShadow = true;
    turret.add(cannon);

    // Emissive accent
    const accentGeometry = new THREE.BoxGeometry(0.7, 0.05, 0.9);
    const accentMaterial = new THREE.MeshStandardMaterial({
      color: TANK_CLASSES[tankClass].color,
      emissive: TANK_CLASSES[tankClass].color,
      emissiveIntensity: 0.5,
      roughness: 0.3,
      metalness: 0.7,
    });
    const accent = new THREE.Mesh(accentGeometry, accentMaterial);
    accent.position.y = 0.35;
    turret.add(accent);

    turret.position.y = 0.65;
    tankBody.add(turret);

    // Set initial position
    tankBody.position.y = 0.5;

    scene.add(tankBody);
    tankRef.current = tankBody;
    turretRef.current = turret;

    // Update health based on tank class
    setHealth(TANK_CLASSES[tankClass].health);
  };

  // Create obstacles
  const createObstacles = (scene) => {
    const obstacleGeometry = new THREE.BoxGeometry(2, 1.5, 2);
    const obstacleMaterial = new THREE.MeshStandardMaterial({
      color: 0x888888,
      roughness: 0.8,
      metalness: 0.2,
    });

    // Add several obstacles
    const obstaclePositions = [
      { x: -5, z: -5 },
      { x: 5, z: 5 },
      { x: -5, z: 5 },
      { x: 5, z: -5 },
      { x: 0, z: 8 },
      { x: 0, z: -8 },
      { x: 8, z: 0 },
      { x: -8, z: 0 },
    ];

    obstaclePositions.forEach(pos => {
      const obstacle = new THREE.Mesh(obstacleGeometry, obstacleMaterial);
      obstacle.position.set(pos.x, 0.5, pos.z);
      obstacle.castShadow = true;
      obstacle.receiveShadow = true;
      obstacle.userData.type = 'destructible';
      scene.add(obstacle);
    });

    // Add destructible obstacles
    const destructiblePositions = [
      { x: -3, z: 0 },
      { x: 3, z: 0 },
      { x: 0, z: -3 },
      { x: 0, z: 3 },
    ];

    const destructibleGeometry = new THREE.BoxGeometry(1, 1, 1);
    const destructibleMaterial = new THREE.MeshStandardMaterial({
      color: 0xcc8844,
      roughness: 0.8,
      metalness: 0.2,
    });

    destructiblePositions.forEach(pos => {
      const obstacle = new THREE.Mesh(destructibleGeometry, destructibleMaterial);
      obstacle.position.set(pos.x, 0.5, pos.z);
      obstacle.castShadow = true;
      obstacle.receiveShadow = true;
      obstacle.userData.type = 'destructible';
      scene.add(obstacle);
    });
  };

  const checkCollisions = () => {
    if (!tankRef.current || !sceneRef.current) return;

    const tankPosition = tankRef.current.position.clone();
    const obstacles = sceneRef.current.children.filter(child =>
      child.userData.type === 'obstacle' || child.userData.type === 'destructible'
    );

    // Check tank-obstacle collisions
    obstacles.forEach(obstacle => {
      const obstaclePosition = obstacle.position.clone();
      const distance = new THREE.Vector2(
        tankPosition.x - obstaclePosition.x,
        tankPosition.z - obstaclePosition.z
      ).length();
      const minDistance = COLLISION_THRESHOLD + (obstacle.geometry.parameters.width || 0) / 2;


      if (distance < minDistance) {
        // Push tank away from obstacle
        const pushVector = new THREE.Vector3(
          tankPosition.x - obstaclePosition.x,
          0,
          tankPosition.z - obstaclePosition.z
        ).normalize();
        tankRef.current.position.add(pushVector.multiplyScalar(minDistance - distance));
      }
    });
    tankRef.current.position.y = 0.5;
    // Check projectile collisions
    projectilesRef.current.forEach((proj, index) => {
      const projectilePosition = proj.projectile.position.clone();

      // Check projectile-obstacle collisions
      obstacles.forEach(obstacle => {
        const obstaclePosition = obstacle.position.clone();
        const distance = projectilePosition.distanceTo(obstaclePosition);
        const collisionThreshold = (obstacle.geometry.parameters.width || 0) / 2;

        if (distance < collisionThreshold) {
          // Handle destructible obstacles
          if (obstacle.userData.type === 'destructible') {
            sceneRef.current.remove(obstacle);
            setScore(prev => prev + 5);

            // Add destruction effect
            createDestructionEffect(obstaclePosition);
          }
          // Remove projectile
          sceneRef.current.remove(proj.projectile);
          sceneRef.current.remove(proj.trail);
          projectilesRef.current.splice(index, 1);
        }
      });

      // Check projectile-tank collisions
      if (projectilePosition.distanceTo(tankPosition) < COLLISION_THRESHOLD) {
        // Remove projectile
        sceneRef.current.remove(proj.projectile);
        sceneRef.current.remove(proj.trail);
        projectilesRef.current.splice(index, 1);

        // Damage tank
        setHealth(prev => Math.max(0, prev - PROJECTILE_DAMAGE));
      }
    });
  };

  const createDestructionEffect = (position) => {
    const particles = [];
    const particleCount = 10;

    for (let i = 0; i < particleCount; i++) {
      const geometry = new THREE.BoxGeometry(0.2, 0.2, 0.2);
      const material = new THREE.MeshBasicMaterial({
        color: 0xcc8844,
        transparent: true,
        opacity: 1.0,
      });
      const particle = new THREE.Mesh(geometry, material);

      particle.position.copy(position);
      particle.userData.velocity = new THREE.Vector3(
        (Math.random() - 0.5) * 0.2,
        Math.random() * 0.2,
        (Math.random() - 0.5) * 0.2
      );

      sceneRef.current.add(particle);
      particles.push(particle);
    }

    // Animate particles
    const animateParticles = () => {
      particles.forEach((particle, index) => {
        particle.position.add(particle.userData.velocity);
        particle.userData.velocity.y -= 0.01; // Gravity
        particle.material.opacity -= 0.02;
        particle.rotation.x += 0.1;
        particle.rotation.z += 0.1;

        if (particle.material.opacity <= 0) {
          sceneRef.current.remove(particle);
          particles.splice(index, 1);
        }
      });

      if (particles.length > 0) {
        requestAnimationFrame(animateParticles);
      }
    };

    animateParticles();
  };

  // Fire projectile
  const fireProjectile = () => {
    if (cooldownRef.current || !turretRef.current || !tankRef.current) return;

    // Create projectile
    const projectileGeometry = new THREE.SphereGeometry(0.1, 8, 8);
    const projectileMaterial = new THREE.MeshStandardMaterial({
      color: TANK_CLASSES[tankClass].color,
      emissive: TANK_CLASSES[tankClass].color,
      emissiveIntensity: 1,
      roughness: 0.3,
      metalness: 0.7,
    });
    const projectile = new THREE.Mesh(projectileGeometry, projectileMaterial);

    // Set projectile position and direction

    // Calculate combined rotation of tank and turret
    const tankWorldQuaternion = new THREE.Quaternion();
    tankRef.current.getWorldQuaternion(tankWorldQuaternion);

    const direction = new THREE.Vector3(0, 0, 1);
    direction.applyQuaternion(tankWorldQuaternion); // Apply tank rotation
    direction.applyAxisAngle(new THREE.Vector3(0, 1, 0), turretRef.current.rotation.y); // Apply turret rotation

    // Set projectile position
    projectile.position.copy(tankRef.current.position);
    projectile.position.y += 0.65; // Adjust height
    projectile.position.add(direction.clone().multiplyScalar(1.1));

        // Add muzzle flash effect
    const flashGeometry = new THREE.SphereGeometry(0.2, 2.5, 8);
    const flashMaterial = new THREE.MeshBasicMaterial({
      color: 0xffff00,
      transparent: true,
      opacity: 0.8,
    });
    const flash = new THREE.Mesh(flashGeometry, flashMaterial);
    flash.position.copy(projectile.position);
    flash.position.add(direction.clone().multiplyScalar(0.1));
    sceneRef.current.add(flash);

    // Remove flash after a short time
    setTimeout(() => {
      sceneRef.current.remove(flash);
    }, 100);

    // Create trail effect
    const trailGeometry = new THREE.CylinderGeometry(0.03, 0.03, 0.5, 8);
    const trailMaterial = new THREE.MeshBasicMaterial({
      color: 0xffff00,
      transparent: true,
      opacity: 0.0,
    });
    const trail = new THREE.Mesh(trailGeometry, trailMaterial);
    trail.rotation.x = Math.PI / 2;
    trail.position.copy(projectile.position);
    trail.position.sub(direction.clone().multiplyScalar(0.25));

    sceneRef.current.add(projectile);
    sceneRef.current.add(trail);
    setTimeout(() => {
      trail.material.opacity = 0.4;
    }, 150);
    // Add to projectiles list
    projectilesRef.current.push({
      projectile,
      direction,
      trail,
      lifeTime: 0,
      maxLife: 100
    });

    // Apply cooldown
    cooldownRef.current = true;
    setCooldown(true);
    setTimeout(() => {
      cooldownRef.current = false;
      setCooldown(false);
    }, COOLDOWN_TIME);

    // Decrease ammo
    setAmmo((prev) => Math.max(0, prev - 1));


  };

  // Use ability
  const useAbility = () => {
    if (abilityCooldownRef.current) return;

    // Apply cooldown
    abilityCooldownRef.current = true;
    setAbilityCooldown(true);
    setTimeout(() => {
      abilityCooldownRef.current = false;
      setAbilityCooldown(false);
    }, ABILITY_COOLDOWN_TIME);

    // Tank class specific ability effects
    switch (tankClass) {
      case 'STRIKER':
        deployMine();
        break;
      case 'SENTINEL':
        empBurst();
        break;
      case 'JUGGERNAUT':
        groundSlam();
        break;
      default:
        break;
    }
  };

  // Deploy mine (Striker ability)
  const deployMine = () => {
    if (!tankRef.current || !sceneRef.current) return;

    // Create mine group for better organization
    const mineGroup = new THREE.Group();

    // Create base of the mine
    const baseGeometry = new THREE.CylinderGeometry(0.3, 0.35, 0.1, 16);
    const baseMaterial = new THREE.MeshStandardMaterial({
      color: 0x333333,
      roughness: 0.7,
      metalness: 0.8,
    });
    const base = new THREE.Mesh(baseGeometry, baseMaterial);
    mineGroup.add(base);

    // Create warning lights
    const lightGeometry = new THREE.SphereGeometry(0.06, 8, 8);
    const lightMaterial = new THREE.MeshStandardMaterial({
      color: 0xff0000,
      emissive: 0xff0000,
      emissiveIntensity: 1,
      roughness: 0.3,
      metalness: 0.7,
    });

    // Add 4 warning lights around the mine
    for (let i = 0; i < 4; i++) {
      const light = new THREE.Mesh(lightGeometry, lightMaterial);
      light.position.x = Math.sin(i * Math.PI / 2) * 0.25;
      light.position.z = Math.cos(i * Math.PI / 2) * 0.25;
      light.position.y = 0.05;
      mineGroup.add(light);
    }

    // Position mine at tank's location
    const position = tankRef.current.position.clone();
    position.y = 0.05; // Set consistent height
    mineGroup.position.copy(position);

    // Don't copy tank's rotation, mine should lay flat
    mineGroup.rotation.set(0, 0, 0);

    sceneRef.current.add(mineGroup);

    // Add blinking effect to warning lights
    let visible = true;
    const blinkInterval = setInterval(() => {
      mineGroup.children.slice(1).forEach(light => {
        light.material.emissiveIntensity = visible ? 1 : 0.2;
      });
      visible = !visible;
    }, 500);

    // Auto-detonate after delay
    setTimeout(() => {
      clearInterval(blinkInterval);
      sceneRef.current.remove(mineGroup);

      // Create explosion effect
      const explosionGeometry = new THREE.SphereGeometry(2, 16, 16);
      const explosionMaterial = new THREE.MeshBasicMaterial({
        color: 0xff5500,
        transparent: true,
        opacity: 0.7,
      });
      const explosion = new THREE.Mesh(explosionGeometry, explosionMaterial);
      explosion.position.copy(mineGroup.position);
      sceneRef.current.add(explosion);

      const blastCenter = mineGroup.position;
      const innerRadius = 2;
      const midRadius = 3.5;
      const outerRadius = 5;
      const innerDamage = 5;
      const midDamage = 3;
      const outerDamage = 1;

      // Check objects in scene for immediate destruction
      sceneRef.current.children.forEach(object => {
        if (object.userData.type === 'destructible') {
          const distance = object.position.distanceTo(blastCenter);
          if (distance <= innerRadius) {
            sceneRef.current.remove(object);
            createDestructionEffect(object.position);
            setScore(prev => prev + 3);
          }
        }
      });

      // Enhanced explosion particles
      const particleCount = 20;
      const particles = [];
      for (let i = 0; i < particleCount; i++) {
        const particleGeometry = new THREE.SphereGeometry(0.1, 8, 8);
        const particleMaterial = new THREE.MeshBasicMaterial({
          color: 0xff3300,
          transparent: true,
          opacity: 0.8,
        });
        const particle = new THREE.Mesh(particleGeometry, particleMaterial);
        
        const angle = (Math.PI * 2 * i) / particleCount;
        const radius = Math.random() * 2;
        particle.position.set(
          blastCenter.x + Math.cos(angle) * radius,
          blastCenter.y + Math.random() * 2,
          blastCenter.z + Math.sin(angle) * radius
        );
        
        particle.userData.velocity = new THREE.Vector3(
          Math.cos(angle) * 0.1,
          0.1,
          Math.sin(angle) * 0.1
        );
        
        sceneRef.current.add(particle);
        particles.push(particle);
      }

      // Fade out explosion and particles
      const fadeInterval = setInterval(() => {
        if (explosion.material.opacity <= 0) {
          clearInterval(fadeInterval);
          sceneRef.current.remove(explosion);
          particles.forEach(particle => sceneRef.current.remove(particle));
        } else {
          explosion.material.opacity -= 0.05;
          explosion.scale.multiplyScalar(1.05);
          
          // Apply damage based on distance from blast center
          if (tankRef.current) {
            const distanceToTank = tankRef.current.position.distanceTo(blastCenter);
            let tickDamage = 0;

            if (distanceToTank <= innerRadius) {
              tickDamage = innerDamage;
            } else if (distanceToTank <= midRadius) {
              tickDamage = midDamage;
            } else if (distanceToTank <= outerRadius) {
              tickDamage = outerDamage;
            }

            if (tickDamage > 0) {
              setHealth(prev => Math.max(0, prev - tickDamage));
            }
          }
          
          particles.forEach(particle => {
            particle.position.add(particle.userData.velocity);
            particle.userData.velocity.y -= 0.01; // gravity
            particle.material.opacity -= 0.03;
          });
        }
      }, 50);

      // Increase score
      setScore((prev) => prev + 5);
    }, 3000);
  };

  // EMP burst (Sentinel ability)
  const empBurst = () => {
    if (!tankRef.current || !sceneRef.current) return;

    // Create EMP effect
    const empGeometry = new THREE.RingGeometry(0.5, 5, 32);
    const empMaterial = new THREE.MeshBasicMaterial({
      color: 0x00ffff,
      transparent: true,
      opacity: 0.7,
      side: THREE.DoubleSide,
    });
    const emp = new THREE.Mesh(empGeometry, empMaterial);

    emp.position.copy(tankRef.current.position);
    emp.position.y = 0.5;
    emp.rotation.x = Math.PI / 2;

    sceneRef.current.add(emp);

    // Expand and fade
    const expandInterval = setInterval(() => {
      if (emp.material.opacity <= 0) {
        clearInterval(expandInterval);
        sceneRef.current.remove(emp);
      } else {
        emp.material.opacity -= 0.05;
        emp.scale.multiplyScalar(1.1);
      }
    }, 50);

    // Increase score
    setScore((prev) => prev + 10);
  };

  // Ground slam (Juggernaut ability)
  const groundSlam = () => {
    if (!tankRef.current || !sceneRef.current) return;

    // Create slam wave effect
    const waveGeometry = new THREE.RingGeometry(0.5, 3, 32);
    const waveMaterial = new THREE.MeshBasicMaterial({
      color: 0xff3300,
      transparent: true,
      opacity: 0.7,
      side: THREE.DoubleSide,
    });
    const wave = new THREE.Mesh(waveGeometry, waveMaterial);

    wave.position.copy(tankRef.current.position);
    wave.position.y = 0.1;
    wave.rotation.x = Math.PI / 2;

    sceneRef.current.add(wave);

    // Create impact effect
    const impactGeometry = new THREE.CylinderGeometry(1.5, 0, 1, 16);
    const impactMaterial = new THREE.MeshBasicMaterial({
      color: 0xff3300,
      transparent: true,
      opacity: 0.7,
    });
    const impact = new THREE.Mesh(impactGeometry, impactMaterial);

    impact.position.copy(tankRef.current.position);
    impact.position.y = 0.5;

    sceneRef.current.add(impact);

    // Expand wave and fade both effects
    const expandInterval = setInterval(() => {
      if (wave.material.opacity <= 0) {
        clearInterval(expandInterval);
        sceneRef.current.remove(wave);
        sceneRef.current.remove(impact);
      } else {
        wave.material.opacity -= 0.05;
        impact.material.opacity -= 0.05;
        wave.scale.multiplyScalar(1.1);
      }
    }, 50);

    // Increase score
    setScore((prev) => prev + 15);
  };

  // Use mobility skill
  const useMobilitySkill = () => {
    if (dashCooldownRef.current) return;

    // Apply cooldown
    dashCooldownRef.current = true;
    setDashCooldown(true);
    setTimeout(() => {
      dashCooldownRef.current = false;
      setDashCooldown(false);
    }, DASH_COOLDOWN_TIME);

    // Tank class specific mobility effects
    switch (tankClass) {
      case 'STRIKER':
        // Dash
        if (tankRef.current) {
          isDashingRef.current = true;
          dashStartTimeRef.current = Date.now();

          // Create dash effect
          const dashGeometry = new THREE.BoxGeometry(0.8, 0.3, 1.5);
          const dashMaterial = new THREE.MeshBasicMaterial({
            color: TANK_CLASSES[tankClass].color,
            transparent: true,
            opacity: 0.5,
          });
          const dashEffect = new THREE.Mesh(dashGeometry, dashMaterial);

          dashEffect.position.copy(tankRef.current.position);
          dashEffect.rotation.copy(tankRef.current.rotation);

          sceneRef.current.add(dashEffect);

          // Fade out dash effect
          const fadeInterval = setInterval(() => {
            if (dashEffect.material.opacity <= 0) {
              clearInterval(fadeInterval);
              sceneRef.current.remove(dashEffect);
            } else {
              dashEffect.material.opacity -= 0.05;
            }
          }, 50);
        }
        break;
      case 'SENTINEL':
        // Shield
        if (tankRef.current) {
          const shieldGeometry = new THREE.SphereGeometry(1.2, 16, 16);
          const shieldMaterial = new THREE.MeshBasicMaterial({
            color: 0x00ffaa,
            transparent: true,
            opacity: 0.3,
            side: THREE.DoubleSide,
          });
          const shield = new THREE.Mesh(shieldGeometry, shieldMaterial);

          shield.position.copy(tankRef.current.position);
          shield.position.y += 0.5;

          sceneRef.current.add(shield);

          // Rotate shield for effect
          const rotateInterval = setInterval(() => {
            shield.rotation.y += 0.05;
            shield.rotation.x += 0.03;
          }, 50);

          // Remove shield after duration
          setTimeout(() => {
            clearInterval(rotateInterval);
            sceneRef.current.remove(shield);
          }, 2000);
        }
        break;
      case 'JUGGERNAUT':
        // Charge
        if (tankRef.current) {
          isDashingRef.current = true;
          dashStartTimeRef.current = Date.now();

          // Create charge effect
          const chargeGeometry = new THREE.ConeGeometry(0.5, 1, 16);
          const chargeMaterial = new THREE.MeshBasicMaterial({
            color: 0xff3300,
            transparent: true,
            opacity: 0.7,
          });
          const chargeEffect = new THREE.Mesh(chargeGeometry, chargeMaterial);

          // Position behind tank
          const direction = new THREE.Vector3(0, 0, -1);
          direction.applyQuaternion(tankRef.current.quaternion);

          chargeEffect.position.copy(tankRef.current.position);
          chargeEffect.position.add(direction.multiplyScalar(1));
          chargeEffect.position.y += 0.5;

          chargeEffect.rotation.copy(tankRef.current.rotation);
          chargeEffect.rotation.y += Math.PI;

          sceneRef.current.add(chargeEffect);

          // Fade out charge effect
          const fadeInterval = setInterval(() => {
            if (chargeEffect.material.opacity <= 0) {
              clearInterval(fadeInterval);
              sceneRef.current.remove(chargeEffect);
            } else {
              chargeEffect.material.opacity -= 0.05;
            }
          }, 50);
        }
        break;
      default:
        break;
    }
  };

  // Handle keyboard input
  const handleKeyDown = (e) => {
    keysRef.current[e.key.toLowerCase()] = true;

    // Handle mobility skill (spacebar)
    if (e.key === ' ' && !dashCooldownRef.current) {
      useMobilitySkill();
    }
  };

  const handleKeyUp = (e) => {
    keysRef.current[e.key.toLowerCase()] = false;
  };

  const handleMouseMove = (e) => {
    // Update mouse position for turret aiming
    mousePositionRef.current.x = (e.clientX / window.innerWidth) * 2 - 1;
    mousePositionRef.current.y = -(e.clientY / window.innerHeight) * 2 + 1;

    // Handle camera rotation
    if (isRotatingRef.current) {
      const deltaX = e.clientX - lastMousePosRef.current.x;
      cameraRotationRef.current += deltaX * CAMERA_ROTATION_SPEED;
      lastMousePosRef.current = { x: e.clientX, y: e.clientY };
    }
  };


  const handleWheel = (e) => {
    // Adjust camera distance based on wheel direction
    cameraDistanceRef.current = Math.max(
      MIN_CAMERA_DISTANCE,
      Math.min(
        MAX_CAMERA_DISTANCE,
        cameraDistanceRef.current + Math.sign(e.deltaY) * CAMERA_ZOOM_SPEED
      )
    );
  };

  const handleMouseDown = (e) => {
    if (e.button === 0) { // Left click
      fireProjectile();
    } else if (e.button === 1) { // Middle click
      useAbility();
    } else if (e.button === 2) { // Right click
      isRotatingRef.current = true;
      lastMousePosRef.current = { x: e.clientX, y: e.clientY };
    }
  };

  const handleMouseUp = (e) => {
    if (e.button === 2) { // Right click
      isRotatingRef.current = false;
    }
  };
  // Game loop
  const gameLoop = (time) => {
    if (!tankRef.current || !turretRef.current || !cameraRef.current || !rendererRef.current || !sceneRef.current) {
      requestRef.current = requestAnimationFrame(gameLoop);
      return;
    }

    const delta = time - lastTimeRef.current;
    lastTimeRef.current = time;

    // Handle player movement
    let moveX = 0;
    let moveZ = 0;
    let rotate = 0;

    if (keysRef.current['w']) moveZ = -1;
    if (keysRef.current['s']) moveZ = 1;
    if (keysRef.current['a']) rotate = 1;
    if (keysRef.current['d']) rotate = -1;

    // Calculate tank's current direction
    const tankDirection = new THREE.Vector3(0, 0, 1);
    tankDirection.applyQuaternion(tankRef.current.quaternion);

    // Rotate tank
    tankRef.current.rotation.y += rotate * TANK_ROTATION_SPEED;

    // Move tank
    let speed = TANK_CLASSES[tankClass].speed;

    // Apply dash if active
    if (isDashingRef.current) {
      const dashElapsed = Date.now() - dashStartTimeRef.current;

      if (dashElapsed < DASH_DURATION) {
        speed *= DASH_SPEED_MULTIPLIER;
      } else {
        isDashingRef.current = false;
      }
    }

    tankRef.current.position.x += tankDirection.x * moveZ * speed;
    tankRef.current.position.z += tankDirection.z * moveZ * speed;

    // Keep tank within arena bounds
    tankRef.current.position.x = Math.max(-ARENA_SIZE / 2, Math.min(ARENA_SIZE / 2, tankRef.current.position.x));
    tankRef.current.position.z = Math.max(-ARENA_SIZE / 2, Math.min(ARENA_SIZE / 2, tankRef.current.position.z));

    // Rotate turret based on mouse position
    if (turretRef.current) {
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(mousePositionRef.current, cameraRef.current);

      // Create a plane at the tank's height
      const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -tankRef.current.position.y);
      const target = new THREE.Vector3();

      if (raycaster.ray.intersectPlane(plane, target)) {
        // Get direction to mouse position
        const direction = new THREE.Vector3();
        direction.subVectors(target, tankRef.current.position);
        direction.y = 0; // Keep turret rotation horizontal
        direction.normalize();

        // Calculate target angle
        const targetAngle = Math.atan2(direction.x, direction.z);

        // Get current turret angle in world space
        const worldQuaternion = new THREE.Quaternion();
        tankRef.current.getWorldQuaternion(worldQuaternion);
        const currentAngle = turretRef.current.rotation.y + Math.atan2(
          2 * (worldQuaternion.w * worldQuaternion.y + worldQuaternion.x * worldQuaternion.z),
          1 - 2 * (worldQuaternion.y * worldQuaternion.y + worldQuaternion.z * worldQuaternion.z)
        );

        // Calculate shortest rotation path
        let angleDiff = targetAngle - currentAngle;
        while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
        while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

        // Smoothly rotate turret
        const rotation = Math.sign(angleDiff) * Math.min(Math.abs(angleDiff), TURRET_ROTATION_SPEED);
        turretRef.current.rotation.y += rotation;
      }
    }

    // Update projectiles
    const projectilesToRemove = [];
    projectilesRef.current.forEach((proj, index) => {
      // Move projectile
      proj.projectile.position.add(proj.direction.clone().multiplyScalar(PROJECTILE_SPEED));

      // Update trail position
      proj.trail.position.copy(proj.projectile.position);
      proj.trail.position.sub(proj.direction.clone().multiplyScalar(0.25));
      proj.trail.lookAt(proj.projectile.position.clone().add(proj.direction));

      // Check if projectile is out of bounds
      proj.lifeTime++;
      if (proj.lifeTime > proj.maxLife ||
        Math.abs(proj.projectile.position.x) > ARENA_SIZE ||
        Math.abs(proj.projectile.position.z) > ARENA_SIZE) {
        projectilesToRemove.push(index);
      }
    });

    // Remove projectiles from scene
    projectilesToRemove.reverse().forEach(index => {
      const proj = projectilesRef.current[index];
      sceneRef.current.remove(proj.projectile);
      sceneRef.current.remove(proj.trail);
      projectilesRef.current.splice(index, 1);
    });

    checkCollisions();

    // Update camera position
    if (cameraRef.current && tankRef.current) {
      // Calculate camera position based on distance and rotation
      const cameraOffset = new THREE.Vector3(
        Math.sin(cameraRotationRef.current) * cameraDistanceRef.current,
        cameraDistanceRef.current,
        Math.cos(cameraRotationRef.current) * cameraDistanceRef.current
      );

      // Calculate camera target position
      const cameraTargetPos = tankRef.current.position.clone().add(cameraOffset);

      // Smoothly interpolate camera position
      cameraRef.current.position.lerp(cameraTargetPos, 0.1);
      cameraRef.current.lookAt(tankRef.current.position.clone().add(new THREE.Vector3(0, 0.5, 0)));
    }

    // Render scene
    rendererRef.current.render(sceneRef.current, cameraRef.current);

    // Continue game loop
    requestRef.current = requestAnimationFrame(gameLoop);
  };

  // Start game
  const startGame = () => {
    setGameStarted(true);
  };

  // Reset game
  const resetGame = () => {
    setGameStarted(false);
    setHealth(100);
    setAmmo(10);
    setScore(0);

    // Reset all cooldowns
    cooldownRef.current = false;
    setCooldown(false);
    abilityCooldownRef.current = false;
    setAbilityCooldown(false);
    dashCooldownRef.current = false;
    setDashCooldown(false);

    // Clear any existing game objects
    if (sceneRef.current) {
      while (sceneRef.current.children.length > 0) {
        sceneRef.current.remove(sceneRef.current.children[0]);
      }
    }

    // Reset refs
    projectilesRef.current = [];
    keysRef.current = {};
    mousePositionRef.current = { x: 0, y: 0 };

    if (requestRef.current) {
      cancelAnimationFrame(requestRef.current);
    }
  };

  // Toggle controls display
  const toggleControls = () => {
    setShowControls(!showControls);
  };

  // Select tank class
  const selectTankClass = (tankClassKey) => {
    setTankClass(tankClassKey);

    if (gameStarted) {
      resetGame();
    }
  };

  // Prevent right-click context menu
  useEffect(() => {
    const preventDefault = (e) => e.preventDefault();
    if (!gameStarted) return;

    // Add event listeners
    window.addEventListener('wheel', handleWheel);
    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('contextmenu', preventDefault);

    return () => {
      // Remove event listeners
      window.addEventListener('wheel', handleWheel);
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('contextmenu', preventDefault);
    };
  }, [gameStarted]);

  return (
    <div className="relative w-full h-screen overflow-hidden bg-gray-900">
      {!gameStarted ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center z-10 bg-gray-900 bg-opacity-70 p-4">
          <h1 className="text-4xl font-bold text-blue-500 mb-8">TANK BLITZ: Velocity Core</h1>

          <div className="flex flex-wrap justify-center gap-6 mb-8">
            {Object.keys(TANK_CLASSES).map((tankClassKey) => (
              <div
                key={tankClassKey}
                className={`w-64 p-4 rounded-lg cursor-pointer transition-all ${tankClass === tankClassKey
                  ? 'bg-gray-700 border-2 border-blue-500 shadow-lg'
                  : 'bg-gray-800 hover:bg-gray-700'
                  }`}
                onClick={() => selectTankClass(tankClassKey)}
              >
                <h3 className="text-xl font-bold" style={{ color: TANK_CLASSES[tankClassKey].color }}>
                  {TANK_CLASSES[tankClassKey].name}
                </h3>
                <div className="mt-2 text-gray-300">
                  <div className="flex justify-between">
                    <span>Speed:</span>
                    <div className="w-32 bg-gray-600 h-3 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-green-500"
                        style={{
                          width: `${(TANK_CLASSES[tankClassKey].speed / (TANK_SPEED * 1.3)) * 100}%`,
                          backgroundColor: TANK_CLASSES[tankClassKey].color
                        }}
                      />
                    </div>
                  </div>
                  <div className="flex justify-between mt-1">
                    <span>Health:</span>
                    <div className="w-32 bg-gray-600 h-3 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-green-500"
                        style={{
                          width: `${(TANK_CLASSES[tankClassKey].health / 150) * 100}%`,
                          backgroundColor: TANK_CLASSES[tankClassKey].color
                        }}
                      />
                    </div>
                  </div>
                </div>
                <div className="mt-3 text-gray-300">
                  <p><span className="text-blue-300">Ability:</span> {TANK_CLASSES[tankClassKey].ability}</p>
                  <p><span className="text-blue-300">Mobility:</span> {TANK_CLASSES[tankClassKey].mobilitySkill}</p>
                </div>
              </div>
            ))}
          </div>

          <button
            className="px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xl font-bold transition-colors"
            onClick={startGame}
          >
            Start Game
          </button>

          <button
            className="mt-4 text-blue-400 hover:text-blue-300 transition-colors"
            onClick={toggleControls}
          >
            {showControls ? 'Hide Controls' : 'Show Controls'}
          </button>

          {showControls && (
            <div className="mt-4 p-4 bg-gray-800 rounded-lg max-w-md">
              <h2 className="text-xl font-bold text-blue-400 mb-2">Controls</h2>
              <ul className="text-gray-300">
                <li className="mb-1">• <strong>WASD</strong> - Move tank</li>
                <li className="mb-1">• <strong>Mouse</strong> - Aim turret</li>
                <li className="mb-1">• <strong>Left Click</strong> - Fire main cannon</li>
                <li className="mb-1">• <strong>Middle Click</strong> - Use ability</li>
                <li className="mb-1">• <strong>Right Click + Drag</strong> - Rotate camera</li>
                <li className="mb-1">• <strong>Spacebar</strong> - Use mobility skill</li>
                <li className="mb-1">• <strong>Mouse Wheel</strong> - Zoom in/out</li>
              </ul>
            </div>
          )}

          {/* Discord Attribution */}
          <div className="absolute bottom-4 text-gray-400 flex items-center gap-2">
            <svg className="w-5 h-5" viewBox="0 0 71 55" fill="currentColor">
              <path d="M60.1045 4.8978C55.5792 2.8214 50.7265 1.2916 45.6527 0.41542C45.5603 0.39851 45.468 0.440769 45.4204 0.525289C44.7963 1.6353 44.105 3.0834 43.6209 4.2216C38.1637 3.4046 32.7345 3.4046 27.3892 4.2216C26.905 3.0581 26.1886 1.6353 25.5617 0.525289C25.5141 0.443589 25.4218 0.40133 25.3294 0.41542C20.2584 1.2888 15.4057 2.8186 10.8776 4.8978C10.8384 4.9147 10.8048 4.9429 10.7825 4.9795C1.57795 18.7309 -0.943561 32.1443 0.293408 45.3914C0.299005 45.4562 0.335386 45.5182 0.385761 45.5576C6.45866 50.0174 12.3413 52.7249 18.1147 54.5195C18.2071 54.5477 18.305 54.5139 18.3638 54.4378C19.7295 52.5728 20.9469 50.6063 21.9907 48.5383C22.0523 48.4172 21.9935 48.2735 21.8676 48.2256C19.9366 47.4931 18.0979 46.6 16.3292 45.5858C16.1893 45.5041 16.1781 45.304 16.3068 45.2082C16.679 44.9293 17.0513 44.6391 17.4067 44.3461C17.471 44.2926 17.5606 44.2813 17.6362 44.3151C29.2558 49.6202 41.8354 49.6202 53.3179 44.3151C53.3935 44.2785 53.4831 44.2898 53.5502 44.3433C53.9057 44.6363 54.2779 44.9293 54.6529 45.2082C54.7816 45.304 54.7732 45.5041 54.6333 45.5858C52.8646 46.6197 51.0259 47.4931 49.0921 48.2228C48.9662 48.2707 48.9102 48.4172 48.9718 48.5383C50.038 50.6034 51.2554 52.5699 52.5959 54.435C52.6519 54.5139 52.7526 54.5477 52.845 54.5195C58.6464 52.7249 64.529 50.0174 70.6019 45.5576C70.6551 45.5182 70.6887 45.459 70.6943 45.3942C72.1747 30.0791 68.2147 16.7757 60.1968 4.9823C60.1772 4.9429 60.1437 4.9147 60.1045 4.8978ZM23.7259 37.3253C20.2276 37.3253 17.3451 34.1136 17.3451 30.1693C17.3451 26.225 20.1717 23.0133 23.7259 23.0133C27.308 23.0133 30.1626 26.2532 30.1066 30.1693C30.1066 34.1136 27.28 37.3253 23.7259 37.3253ZM47.3178 37.3253C43.8196 37.3253 40.9371 34.1136 40.9371 30.1693C40.9371 26.225 43.7636 23.0133 47.3178 23.0133C50.9 23.0133 53.7545 26.2532 53.6986 30.1693C53.6986 34.1136 50.9 37.3253 47.3178 37.3253Z"/>
            </svg>
            <a 
              href="https://discord.com/users/cody.somerville" 
              target="_blank" 
              rel="noopener noreferrer"
              className="hover:text-gray-300 transition-colors"
            >
              Created by cody.somerville
            </a>
          </div>
        </div>
      ) : (
        <>
          {/* Game HUD */}
          <div className="absolute top-0 left-0 w-full p-4 flex justify-between z-10 pointer-events-none">
            <div className="flex flex-col">
              <div className="flex items-center mb-2">
                <div className="w-32 h-4 bg-gray-800 bg-opacity-70 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-red-500"
                    style={{ width: `${(health / TANK_CLASSES[tankClass].health) * 100}%` }}
                  />
                </div>
                <span className="ml-2 text-white font-bold">{health}</span>
              </div>

              <div className="flex items-center">
                <div className="w-32 h-4 bg-gray-800 bg-opacity-70 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-yellow-500"
                    style={{ width: `${(ammo / 10) * 100}%` }}
                  />
                </div>
                <span className="ml-2 text-white font-bold">{ammo}</span>
              </div>
            </div>

            <div className="text-right">
              <div className="text-2xl font-bold text-white mb-2">Score: {score}</div>
              <div className="text-lg text-blue-300">{TANK_CLASSES[tankClass].name}</div>
            </div>
          </div>

          {/* Cooldown indicators */}
          <div className="absolute bottom-6 right-6 flex gap-4 z-10">
            <div className={`w-16 h-16 rounded-full flex items-center justify-center ${cooldown ? 'bg-gray-700 bg-opacity-70' : 'bg-blue-800 bg-opacity-50'
              }`}>
              <div className="w-12 h-12 rounded-full bg-gray-800 flex items-center justify-center">
                <span className="text-2xl text-white">💥</span>
              </div>
            </div>

            <div className={`w-16 h-16 rounded-full flex items-center justify-center ${abilityCooldown ? 'bg-gray-700 bg-opacity-70' : 'bg-blue-800 bg-opacity-50'
              }`}>
              <div className="w-12 h-12 rounded-full bg-gray-800 flex items-center justify-center">
                {TANK_CLASSES[tankClass].abilityIcon}
              </div>
            </div>

            <div className={`w-16 h-16 rounded-full flex items-center justify-center ${dashCooldown ? 'bg-gray-700 bg-opacity-70' : 'bg-blue-800 bg-opacity-50'
              }`}>
              <div className="w-12 h-12 rounded-full bg-gray-800 flex items-center justify-center">
                <Shield className="w-6 h-6" />
              </div>
            </div>
          </div>

          {/* Reset button */}
          <button
            className="absolute bottom-4 left-4 z-20 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg pointer-events-auto"
            onClick={resetGame}
          >
            Restart
          </button>
        </>
      )}

      {/* Game container */}
      <div ref={containerRef} className="w-full h-full" />
    </div>
  );
}