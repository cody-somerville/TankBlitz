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
    scene.add(directionalLight);
    
    // Create arena floor
    const floorGeometry = new THREE.PlaneGeometry(40, 40);
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
      obstacle.position.set(pos.x, 0.75, pos.z);
      obstacle.castShadow = true;
      obstacle.receiveShadow = true;
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
      scene.add(obstacle);
    });
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
    projectile.position.copy(tankRef.current.position);
    projectile.position.y += 0.8;
    
    // Calculate direction from turret rotation
    const direction = new THREE.Vector3(0, 0, 1);
    direction.applyQuaternion(turretRef.current.quaternion);
    
    // Create trail effect
    const trailGeometry = new THREE.CylinderGeometry(0.03, 0.03, 0.5, 8);
    const trailMaterial = new THREE.MeshBasicMaterial({ 
      color: TANK_CLASSES[tankClass].color,
      transparent: true,
      opacity: 0.7,
    });
    const trail = new THREE.Mesh(trailGeometry, trailMaterial);
    trail.rotation.x = Math.PI / 2;
    trail.position.copy(projectile.position);
    trail.position.sub(direction.clone().multiplyScalar(0.25));
    
    sceneRef.current.add(projectile);
    sceneRef.current.add(trail);
    
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
    
    // Add muzzle flash effect
    const flashGeometry = new THREE.SphereGeometry(0.2, 8, 8);
    const flashMaterial = new THREE.MeshBasicMaterial({ 
      color: 0xffff00,
      transparent: true,
      opacity: 0.8,
    });
    const flash = new THREE.Mesh(flashGeometry, flashMaterial);
    flash.position.copy(projectile.position);
    flash.position.add(direction.clone().multiplyScalar(0.5));
    sceneRef.current.add(flash);
    
    // Remove flash after a short time
    setTimeout(() => {
      sceneRef.current.remove(flash);
    }, 100);
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
    
    const mineGeometry = new THREE.CylinderGeometry(0.2, 0.2, 0.1, 8);
    const mineMaterial = new THREE.MeshStandardMaterial({ 
      color: 0xff0000,
      emissive: 0xff0000,
      emissiveIntensity: 0.5,
      roughness: 0.3,
      metalness: 0.7,
    });
    const mine = new THREE.Mesh(mineGeometry, mineMaterial);
    
    mine.position.copy(tankRef.current.position);
    mine.position.y = 0.05;
    mine.rotation.x = Math.PI / 2;
    
    sceneRef.current.add(mine);
    
    // Add blinking effect
    let visible = true;
    const blinkInterval = setInterval(() => {
      mine.visible = visible;
      visible = !visible;
    }, 500);
    
    // Auto-detonate after delay
    setTimeout(() => {
      clearInterval(blinkInterval);
      sceneRef.current.remove(mine);
      
      // Create explosion effect
      const explosionGeometry = new THREE.SphereGeometry(2, 16, 16);
      const explosionMaterial = new THREE.MeshBasicMaterial({ 
        color: 0xff5500,
        transparent: true,
        opacity: 0.7,
      });
      const explosion = new THREE.Mesh(explosionGeometry, explosionMaterial);
      explosion.position.copy(mine.position);
      sceneRef.current.add(explosion);
      
      // Fade out explosion
      const fadeInterval = setInterval(() => {
        if (explosion.material.opacity <= 0) {
          clearInterval(fadeInterval);
          sceneRef.current.remove(explosion);
        } else {
          explosion.material.opacity -= 0.05;
          explosion.scale.multiplyScalar(1.05);
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
  
  // Handle mouse movement
  const handleMouseMove = (e) => {
    // Convert mouse position to normalized device coordinates
    mousePositionRef.current.x = (e.clientX / window.innerWidth) * 2 - 1;
    mousePositionRef.current.y = -(e.clientY / window.innerHeight) * 2 + 1;
  };
  
  // Handle mouse click
  const handleMouseDown = (e) => {
    if (e.button === 0) { // Left click
      fireProjectile();
    } else if (e.button === 2) { // Right click
      useAbility();
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
    const arenaSize = 30;
    tankRef.current.position.x = Math.max(-arenaSize/2, Math.min(arenaSize/2, tankRef.current.position.x));
    tankRef.current.position.z = Math.max(-arenaSize/2, Math.min(arenaSize/2, tankRef.current.position.z));
    
    // Rotate turret based on mouse position
    if (turretRef.current) {
      // Intersect with a horizontal plane at turret height
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(mousePositionRef.current, cameraRef.current);
      
      const plane = new THREE.Plane(new THREE.Vector3(0, 0, 0), -tankRef.current.position.y);
      const target = new THREE.Vector3();
      raycaster.ray.intersectPlane(plane, target);
      
      // Calculate direction to the intersection point
      if (target) {
        const direction = new THREE.Vector3();
        direction.subVectors(target, tankRef.current.position);
        direction.y = 0; // Keep turret rotation on horizontal plane
        direction.normalize();
        
        // Get current turret direction
        const currentDir = new THREE.Vector3(0, 0, 1);
        currentDir.applyQuaternion(turretRef.current.quaternion);
        
        // Smoothly rotate turret
        const targetAngle = Math.atan2(direction.x, direction.z);
        const currentAngle = Math.atan2(currentDir.x, currentDir.z);
        
        // Calculate shortest rotation
        let angleDiff = targetAngle - currentAngle;
        while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
        while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
        
        // Apply smooth rotation
        const rotationAmount = Math.sign(angleDiff) * Math.min(Math.abs(angleDiff), TURRET_ROTATION_SPEED);
        turretRef.current.rotation.y += rotationAmount;
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
          Math.abs(proj.projectile.position.x) > 20 || 
          Math.abs(proj.projectile.position.z) > 20) {
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
    
    // Update camera position
    if (cameraRef.current && tankRef.current) {
      // Calculate camera target position (following behind tank)
      const cameraOffset = new THREE.Vector3(0, 5, 5);
      const tankDirection = new THREE.Vector3(0, 0, 1);
      tankDirection.applyQuaternion(tankRef.current.quaternion);
      
      // Invert direction to position camera behind tank
      const cameraTargetPos = tankRef.current.position.clone();
      cameraTargetPos.add(cameraOffset);
      
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
    
    // Restart game
    setTimeout(() => {
      startGame();
    }, 100);
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
    const handleContextMenu = (e) => {
      e.preventDefault();
    };
    
    window.addEventListener('contextmenu', handleContextMenu);
    
    return () => {
      window.removeEventListener('contextmenu', handleContextMenu);
    };
  }, []);

  return (
    <div className="relative w-full h-screen overflow-hidden bg-gray-900">
      {!gameStarted ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center z-10 bg-gray-900 bg-opacity-90 p-4">
          <h1 className="text-4xl font-bold text-blue-500 mb-8">TANK BLITZ: Velocity Core</h1>
          
          <div className="flex flex-wrap justify-center gap-6 mb-8">
            {Object.keys(TANK_CLASSES).map((tankClassKey) => (
              <div 
                key={tankClassKey}
                className={`w-64 p-4 rounded-lg cursor-pointer transition-all ${
                  tankClass === tankClassKey 
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
                <li className="mb-1">• <strong>Right Click</strong> - Use ability</li>
                <li className="mb-1">• <strong>Spacebar</strong> - Use mobility skill</li>
              </ul>
            </div>
          )}
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
            <div className={`w-16 h-16 rounded-full flex items-center justify-center ${
              cooldown ? 'bg-gray-700 bg-opacity-70' : 'bg-blue-800 bg-opacity-50'
            }`}>
              <div className="w-12 h-12 rounded-full bg-gray-800 flex items-center justify-center">
                <span className="text-2xl text-white">🔫</span>
              </div>
            </div>
            
            <div className={`w-16 h-16 rounded-full flex items-center justify-center ${
              abilityCooldown ? 'bg-gray-700 bg-opacity-70' : 'bg-blue-800 bg-opacity-50'
            }`}>
              <div className="w-12 h-12 rounded-full bg-gray-800 flex items-center justify-center">
                {TANK_CLASSES[tankClass].abilityIcon}
              </div>
            </div>
            
            <div className={`w-16 h-16 rounded-full flex items-center justify-center ${
              dashCooldown ? 'bg-gray-700 bg-opacity-70' : 'bg-blue-800 bg-opacity-50'
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