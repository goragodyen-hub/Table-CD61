/*
 * Main Application Script (app.js)
 */
const SHEET_ID = "1ejhwAkkbmPyHIp5LqwVT3GlMQdBYPU8A0_No0qvrE7g"; // Google Sheet ID for tasks

// =========================================================================
// Supabase Configuration & Initialization
// =========================================================================
const SUPABASE_URL = "https://tklggugrxkohsdejszyr.supabase.co"; // Drop in your Supabase URL here (e.g., "https://your-project.supabase.co")
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRrbGdndWdyeGtvaHNkZWpzenlyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk5MDcyNjQsImV4cCI6MjA5NTQ4MzI2NH0.7aspPfZCDVoHMp_OMYmfQPPel26T4CvBZME6uukNp0g"; // Drop in your Supabase Anon Key here

let supabaseClient = null;
if (typeof supabase !== 'undefined' && SUPABASE_URL && SUPABASE_ANON_KEY) {
    try {
        supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        console.log("🚀 Supabase client initialized successfully!");
    } catch (e) {
        console.error("⚠️ Failed to initialize Supabase:", e);
    }
} else {
    console.log("ℹ️ Supabase not configured or SDK missing. Running in LocalStorage-only mode.");
}

// =========================================================================
// UUID Helper Functions for Supabase Compatibility
// =========================================================================
function generateUUID() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    // Fallback for older browsers
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

function isValidUUID(str) {
    if (typeof str !== 'string') return false;
    const regex = /^[0-9a-f]{8}-[0-9a-f]{4}-[45][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return regex.test(str);
}

class StudyTableApp {
    constructor() {
        this.state = {
            timetable_A: [],
            timetable_B: [],
            tasks: [],
            active_week: 'A',
            viewing_week: 'A',
            auto_week_switch: true,
            last_week_monday: '',
            theme: 'dark',
            settings: {
            },
            syncQueue: [],
            isSyncing: false,
            pomodoro: {
                sessions: 0,
                minutes: 0,
                activeMode: 'study', // 'study', 'short-break', 'long-break'
                duration: 1500,      // ในหน่วยวินาที (25 นาที)
                timeLeft: 1500,
                isRunning: false
            }
        };
        // UI Views
        this.views = ['dashboard', 'timetable', 'tasks', 'pomodoro', 'analytics', 'exams'];
        this.currentView = 'dashboard';
        // Timer Interval
        this.timerInterval = null;
        // Web Audio Elements for Ambient sounds
        this.audioCtx = null;
        this.ambientNodes = {
            rain: null,
            lofi: null,
            forest: null
        };
        this.soundPlaying = {
            rain: false,
            lofi: false,
            forest: false
        };
        this.volume = 0.5;
        // Core Timetable parameters (07:00 - 20:00)
        this.gridStartHour = 7;
        this.gridEndHour = 20;
        this.totalMinutes = (this.gridEndHour - this.gridStartHour) * 60; // 780 minutes
        // Bindings
        this.init();
    }
    init() {
        this.loadState();
        this.checkAutoWeekSwitch();
        // One-time clear of cached mock tasks
        if (!localStorage.getItem('study_table_tasks_cleared_v1')) {
            this.state.tasks = [];
            this.saveState();
            localStorage.setItem('study_table_tasks_cleared_v1', 'true');
        }
        this.setupDOMReferences();
        this.setupEventListeners();
        this.setupAuth();
        this.applyTheme();

        // Check if user is already logged in
        const savedProfile = localStorage.getItem('study_table_profile');
        if (savedProfile) {
            try {
                this.state.profile = JSON.parse(savedProfile);
                this.hideAuthOverlay();
                this.updateSidebarProfile();
            } catch (e) {
                this.showAuthOverlay();
            }
        } else {
            this.showAuthOverlay();
        }

        this.renderAll();
        
        // Start live greeting update
        this.updateHeaderGreeting();
        setInterval(() => this.updateHeaderGreeting(), 60000);
        // Setup PWA install capability
        this.setupPWA();
        // Initialize sync settings display and sync with sheet on startup
        this.updateSyncUI();
        // Force fetch tasks from Google Sheet on startup if URL is configured
        if (this.state.settings && this.state.settings.googleScriptUrl) {
            this.syncWithSheet(true);
        } else {
            this.syncWithSheet();
        }
    }

    // ----------------------------------------------------
    // AUTH SYSTEM
    // ----------------------------------------------------
    showAuthOverlay() {
        const overlay = document.getElementById('auth-overlay');
        if (overlay) overlay.classList.add('active');
        this.switchAuthView('login');
        
        // Hide the guest logout button when auth overlay is open
        const headerGuestLogoutBtn = document.getElementById('header-guest-logout-btn');
        if (headerGuestLogoutBtn) headerGuestLogoutBtn.style.display = 'none';
    }

    hideAuthOverlay() {
        const overlay = document.getElementById('auth-overlay');
        if (overlay) overlay.classList.remove('active');
    }

    switchAuthView(view) {
        document.querySelectorAll('.auth-view').forEach(v => v.classList.remove('active'));
        const target = document.getElementById(`auth-${view}-view`);
        if (target) target.classList.add('active');
    }

    generateAccessCode() {
        const prefix = 'ST';
        const num = Math.floor(100 + Math.random() * 900);
        const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
        const suffix = letters[Math.floor(Math.random() * letters.length)] +
                       letters[Math.floor(Math.random() * letters.length)];
        return `${prefix}-${num}-${suffix}`;
    }

    setupAuth() {
        // Switch between login/register views
        const goToRegisterBtn = document.getElementById('go-to-register-btn');
        const goToLoginBtn = document.getElementById('go-to-login-btn');
        if (goToRegisterBtn) goToRegisterBtn.addEventListener('click', () => this.switchAuthView('register'));
        if (goToLoginBtn) goToLoginBtn.addEventListener('click', () => this.switchAuthView('login'));

        // Copy Access Code
        const copyBtn = document.getElementById('copy-access-code-btn');
        if (copyBtn) {
            copyBtn.addEventListener('click', () => {
                const codeVal = document.getElementById('generated-access-code').textContent;
                navigator.clipboard.writeText(codeVal).then(() => {
                    alert('คัดลอกรหัสเข้าใช้งานแล้ว!');
                }).catch(err => {
                    console.error('Failed to copy access code: ', err);
                });
            });
        }

        // Start App Button (after successful registration)
        const startAppBtn = document.getElementById('start-app-btn');
        if (startAppBtn) {
            startAppBtn.addEventListener('click', () => {
                this.hideAuthOverlay();
                this.updateSidebarProfile();
                this.renderAll();
                this.updateHeaderGreeting();
            });
        }

        // Guest mode quick access buttons
        const guestBtns = document.querySelectorAll('.guest-login-btn');
        guestBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const classroom = e.target.getAttribute('data-classroom');
                
                // Set profile to a temporary guest profile
                this.state.profile = {
                    id: null,
                    nickname: "ผู้เยี่ยมชม",
                    classroom: classroom,
                    accessCode: `GUEST-${classroom.replace('ม.', '').replace('/', '-')}`,
                    isGuest: true
                };
                localStorage.setItem('study_table_profile', JSON.stringify(this.state.profile));
                
                // Load mock data for selected classroom
                this.loadMockData(classroom);
                
                this.hideAuthOverlay();
                this.updateSidebarProfile();
                this.renderAll();
                this.updateHeaderGreeting();
            });
        });

        // Register form submit
        const registerForm = document.getElementById('auth-register-form');
        if (registerForm) {
            registerForm.addEventListener('submit', (e) => {
                e.preventDefault();
                const nickname = document.getElementById('auth-nickname').value.trim();
                const classroom = document.getElementById('auth-classroom').value;
                if (!nickname) { alert('กรุณากรอกชื่อเล่นของคุณ'); return; }

                const accessCode = this.generateAccessCode();
                this.state.profile = {
                    id: null, // Will be populated with UUID from Supabase
                    nickname: nickname,
                    classroom: classroom,
                    accessCode: accessCode
                };
                
                // Save to localStorage
                localStorage.setItem('study_table_profile', JSON.stringify(this.state.profile));
                
                // Set generated access code text
                const codeEl = document.getElementById('generated-access-code');
                if (codeEl) codeEl.textContent = accessCode;
                
                // Save student profile to students list in localStorage (for admin management)
                let students = [];
                try {
                    const savedStudents = localStorage.getItem('study_table_students');
                    if (savedStudents) students = JSON.parse(savedStudents);
                } catch (err) {}
                
                students.push(this.state.profile);
                localStorage.setItem('study_table_students', JSON.stringify(students));

                // Load default timetable for this classroom
                this.loadMockData(classroom);
                
                // Asynchronously sync profile and mock timetable to Supabase if configured
                if (supabaseClient) {
                    supabaseClient.from('profiles').insert([{
                        name: `${nickname} (${classroom})`,
                        access_code: accessCode
                    }])
                    .select('id')
                    .single()
                    .then(({ data: profileData, error }) => {
                        if (error) {
                            console.error("Error saving profile to Supabase:", error);
                        } else if (profileData && profileData.id) {
                            console.log("Profile successfully saved to Supabase! UUID:", profileData.id);
                            this.state.profile.id = profileData.id;
                            localStorage.setItem('study_table_profile', JSON.stringify(this.state.profile));
                            this.uploadTimetableToSupabase(profileData.id);
                        }
                    });
                }
                
                // Switch to success view
                this.switchAuthView('success');
            });
        }

        // Login form submit
        const loginForm = document.getElementById('auth-login-form');
        if (loginForm) {
            loginForm.addEventListener('submit', (e) => {
                e.preventDefault();
                const accessCode = document.getElementById('auth-access-code').value.trim().toUpperCase();
                if (!accessCode) { alert('กรุณากรอกรหัสเข้าใช้งาน'); return; }

                // Check guest login code
                if (accessCode.startsWith('GUEST-')) {
                    const roomSuffix = accessCode.replace('GUEST-', '').replace('-', '/');
                    const classroom = `ม.${roomSuffix}`;
                    this.state.profile = {
                        id: null,
                        nickname: "ผู้เยี่ยมชม",
                        classroom: classroom,
                        accessCode: accessCode,
                        isGuest: true
                    };
                    localStorage.setItem('study_table_profile', JSON.stringify(this.state.profile));
                    this.loadMockData(classroom);
                    this.hideAuthOverlay();
                    this.updateSidebarProfile();
                    this.renderAll();
                    this.updateHeaderGreeting();
                    return;
                }

                // Search in students list in localStorage
                let students = [];
                try {
                    const savedStudents = localStorage.getItem('study_table_students');
                    if (savedStudents) students = JSON.parse(savedStudents);
                } catch (err) {}

                if (supabaseClient) {
                    // Try Supabase auth first
                    supabaseClient.from('profiles')
                        .select('*')
                        .eq('access_code', accessCode)
                        .single()
                        .then(({ data: profile, error }) => {
                            if (error || !profile) {
                                // Fallback to check localStorage students
                                const found = students.find(s => s.accessCode.toUpperCase() === accessCode);
                                if (found) {
                                    // Log them in using local data, and upload local profile to Supabase to keep them in sync
                                    this.state.profile = found;
                                    localStorage.setItem('study_table_profile', JSON.stringify(found));
                                    
                                    supabaseClient.from('profiles').insert([{
                                        name: `${found.nickname} (${found.classroom})`,
                                        access_code: found.accessCode
                                    }])
                                    .select('id')
                                    .single()
                                    .then(({ data: profileData }) => {
                                        if (profileData && profileData.id) {
                                            this.state.profile.id = profileData.id;
                                            localStorage.setItem('study_table_profile', JSON.stringify(this.state.profile));
                                            
                                            this.uploadTimetableToSupabase(profileData.id);
                                            this.uploadTasksToSupabase(profileData.id);
                                        }
                                    });
                                    
                                    this.hideAuthOverlay();
                                    this.updateSidebarProfile();
                                    this.renderAll();
                                    this.updateHeaderGreeting();
                                } else {
                                    alert('ไม่พบรหัสเข้าใช้งานนี้ในระบบ กรุณาสร้างโปรไฟล์ใหม่');
                                }
                            } else {
                                // Successfully found in Supabase! Restore all their cloud data!
                                const profileUUID = profile.id;
                                const nameVal = profile.name;
                                const match = nameVal.match(/(.*)\s*\((.*)\)/);
                                let nickname = nameVal;
                                let classroom = "ม.2/3";
                                if (match) {
                                    nickname = match[1].trim();
                                    classroom = match[2].trim();
                                }
                                
                                this.state.profile = {
                                    id: profileUUID,
                                    nickname: nickname,
                                    classroom: classroom,
                                    accessCode: profile.access_code
                                };
                                localStorage.setItem('study_table_profile', JSON.stringify(this.state.profile));
                                
                                // Sync local students cache if missing
                                const exists = students.some(s => s.accessCode.toUpperCase() === accessCode);
                                if (!exists) {
                                    students.push(this.state.profile);
                                    localStorage.setItem('study_table_students', JSON.stringify(students));
                                }

                                // Download tasks and timetables from Supabase
                                Promise.all([
                                    supabaseClient.from('tasks').select('*').eq('profile_id', profileUUID),
                                    supabaseClient.from('timetables').select('*').eq('profile_id', profileUUID)
                                ]).then(([tasksRes, timetablesRes]) => {
                                    // 1. Restore Tasks
                                    if (tasksRes.data && tasksRes.data.length > 0) {
                                        this.state.tasks = tasksRes.data.map(t => ({
                                            id: t.id,
                                            title: t.title,
                                            subject: t.subject || "",
                                            priority: t.priority || "medium",
                                            dueDate: t.duedate || "",
                                            notes: t.notes || "",
                                            completed: t.completed ? true : false
                                        }));
                                    } else {
                                        this.state.tasks = [];
                                    }

                                    // 2. Restore Timetables
                                    if (timetablesRes.data && timetablesRes.data.length > 0) {
                                        const slotsA = [];
                                        const slotsB = [];
                                        timetablesRes.data.forEach(t => {
                                            const slot = {
                                                id: t.id,
                                                week: t.week,
                                                name: t.name,
                                                room: t.room || "",
                                                teacher: t.teacher || "",
                                                day: t.day,
                                                startTime: t.starttime || "",
                                                endTime: t.endtime || "",
                                                color: t.color || ""
                                            };
                                            if (t.week === 'A') slotsA.push(slot);
                                            else slotsB.push(slot);
                                        });
                                        this.state.timetable_A = slotsA;
                                        this.state.timetable_B = slotsB;
                                    } else {
                                        // Fallback to defaults if no timetables in Supabase
                                        this.loadMockData(classroom);
                                        this.uploadTimetableToSupabase(profileUUID);
                                    }

                                    this.saveState();
                                    this.hideAuthOverlay();
                                    this.updateSidebarProfile();
                                    this.renderAll();
                                    this.updateHeaderGreeting();
                                }).catch(err => {
                                    console.error("Failed fetching user data from Supabase:", err);
                                    this.loadMockData(classroom);
                                    this.hideAuthOverlay();
                                    this.updateSidebarProfile();
                                    this.renderAll();
                                    this.updateHeaderGreeting();
                                });
                            }
                        });
                } else {
                    // Fallback to local storage auth only
                    const found = students.find(s => s.accessCode.toUpperCase() === accessCode);
                    if (found) {
                        this.state.profile = found;
                        localStorage.setItem('study_table_profile', JSON.stringify(found));
                        this.loadMockData(found.classroom);
                        this.hideAuthOverlay();
                        this.updateSidebarProfile();
                        this.renderAll();
                        this.updateHeaderGreeting();
                    } else {
                        alert('ไม่พบรหัสเข้าใช้งานนี้ในระบบ กรุณาสร้างโปรไฟล์ใหม่');
                    }
                }
            });
        }

        // Logout button logic (shared between sidebar and mobile header)
        const handleLogout = () => {
            const isGuest = this.state.profile && this.state.profile.isGuest;
            const msg = isGuest ? 'ต้องการออกจากโหมดผู้เยี่ยมชมใช่ไหม?' : 'ต้องการออกจากระบบหรือสลับผู้ใช้ใช่ไหม?';
            if (confirm(msg)) {
                // Clear profile
                localStorage.removeItem('study_table_profile');
                // Clear saved state so next user doesn't inherit previous user's timetable/tasks
                localStorage.removeItem('study_table_state');

                // Reset in-memory state completely
                this.state.profile = null;
                this.state.tasks = [];
                this.state.timetable_A = [];
                this.state.timetable_B = [];
                this.state.syncQueue = [];
                this.state.isSyncing = false;

                // Reset view to dashboard
                this.currentView = 'dashboard';

                const navAdmin = document.getElementById('nav-admin');
                if (navAdmin) navAdmin.style.display = 'none';
                this.views = this.views.filter(v => v !== 'admin');

                this.showAuthOverlay();
            }
        };

        const logoutBtn = document.getElementById('sidebar-logout-btn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', handleLogout);
        }

        const headerGuestLogoutBtn = document.getElementById('header-guest-logout-btn');
        if (headerGuestLogoutBtn) {
            headerGuestLogoutBtn.addEventListener('click', handleLogout);
        }
    }

    updateSidebarProfile() {
        if (!this.state.profile) return;
        const nameEl = document.getElementById('sidebar-profile-name');
        const codeEl = document.getElementById('sidebar-profile-code');
        const headerGuestLogoutBtn = document.getElementById('header-guest-logout-btn');
        
        if (nameEl) nameEl.textContent = `${this.state.profile.nickname} (${this.state.profile.classroom})`;
        if (codeEl) {
            if (this.state.profile.isGuest) {
                codeEl.textContent = `โหมดผู้เยี่ยมชม (อ่านเท่านั้น)`;
                if (headerGuestLogoutBtn) headerGuestLogoutBtn.style.display = 'inline-flex';
            } else {
                codeEl.textContent = `รหัส: ${this.state.profile.accessCode}`;
                if (headerGuestLogoutBtn) headerGuestLogoutBtn.style.display = 'none';
            }
        }
        
        // Admin verification for 'goragod'
        const navAdmin = document.getElementById('nav-admin');
        if (this.state.profile.nickname.toLowerCase() === 'goragod') {
            if (navAdmin) navAdmin.style.display = 'flex';
            if (!this.views.includes('admin')) {
                this.views.push('admin');
            }
        } else {
            if (navAdmin) navAdmin.style.display = 'none';
            this.views = this.views.filter(v => v !== 'admin');
        }

        // Dynamically update the reset default timetable button text
        if (this.resetDefaultTimetableBtn) {
            this.resetDefaultTimetableBtn.innerHTML = `<i class="fa-solid fa-arrow-rotate-left"></i> โหลดตารางเรียนเริ่มต้น ${this.state.profile.classroom}`;
            this.resetDefaultTimetableBtn.setAttribute('title', `โหลดค่าเริ่มต้นจากตารางเรียน ${this.state.profile.classroom}`);
        }
    }

    loadTasksFromSheet() {
        const sheetUrl = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json`;
        fetch(sheetUrl)
            .then(res => res.text())
            .then(text => {
                // Google returns JSON wrapped in junk, extract the JSON part
                const jsonText = text.substring(text.indexOf('{'), text.lastIndexOf('}') + 1);
                const data = JSON.parse(jsonText);
                const rows = data.table.rows;
                const tasks = rows.map(row => {
                    const c = row.c;
                    return {
                        id: c[0]?.v || `task-${Date.now()}`,
                        title: c[1]?.v || "",
                        subject: c[2]?.v || "",
                        priority: (c[3]?.v || "low").toLowerCase(),
                        dueDate: c[4]?.v || new Date().toISOString().split('T')[0],
                        notes: c[5]?.v || "",
                        completed: c[6]?.v === true || c[6]?.v === "TRUE"
                    };
                });
                this.state.tasks = tasks;
                this.saveState();
                this.renderTasks();
                console.log('[Google Sheet] Loaded tasks', tasks.length);
            })
            .catch(err => console.error('Failed to load tasks from Google Sheet:', err));
    }
    setupPWA() {
        // Register Service Worker
        if ('serviceWorker' in navigator) {
            window.addEventListener('load', () => {
                navigator.serviceWorker.register('./sw.js')
                    .then(reg => console.log('Service Worker registered successfully:', reg.scope))
                    .catch(err => console.error('Service Worker registration failed:', err));
            });
        }
        // PWA Install Prompt handling
        let deferredPrompt;
        window.addEventListener('beforeinstallprompt', (e) => {
            // Prevent Chrome 67 and earlier from automatically showing the prompt
            e.preventDefault();
            // Stash the event so it can be triggered later.
            deferredPrompt = e;
            // Update UI to notify the user they can install the PWA
            if (this.sidebarInstallBtn) {
                this.sidebarInstallBtn.style.display = 'inline-flex';
            }
        });
        if (this.sidebarInstallBtn) {
            this.sidebarInstallBtn.addEventListener('click', async () => {
                if (!deferredPrompt) return;
                // Show the install prompt
                deferredPrompt.prompt();
                // Wait for the user to respond to the prompt
                const { outcome } = await deferredPrompt.userChoice;
                console.log(`User response to the install prompt: ${outcome}`);
                // We've used the prompt, and can't use it again
                deferredPrompt = null;
                // Hide the install button
                this.sidebarInstallBtn.style.display = 'none';
            });
        }
        window.addEventListener('appinstalled', (evt) => {
            console.log('Study Table was installed.');
            if (this.sidebarInstallBtn) {
                this.sidebarInstallBtn.style.display = 'none';
            }
        });
    }

    // ----------------------------------------------------
    // SUPABASE BULK SYNC HELPERS
    // ----------------------------------------------------
    async uploadTimetableToSupabase(profileUUID = null) {
        if (!supabaseClient || !this.state.profile) return;
        const targetUUID = profileUUID || this.state.profile.id;
        if (!targetUUID) return;
        
        try {
            // Delete old timetables for this user first
            await supabaseClient.from('timetables').delete().eq('profile_id', targetUUID);
            
            // Prepare slot rows
            const rows = [];
            const timetable_slots = [...this.state.timetable_A, ...this.state.timetable_B];
            
            timetable_slots.forEach(slot => {
                rows.push({
                    id: slot.id,
                    profile_id: targetUUID,
                    week: slot.week,
                    name: slot.name,
                    room: slot.room || "",
                    teacher: slot.teacher || "",
                    day: slot.day,
                    starttime: slot.startTime,
                    endtime: slot.endTime,
                    color: slot.color || ""
                });
            });
            
            if (rows.length > 0) {
                const { error } = await supabaseClient.from('timetables').insert(rows);
                if (error) console.error("Error uploading timetables to Supabase:", error);
                else console.log("Successfully uploaded timetables to Supabase. Count:", rows.length);
            }
        } catch (err) {
            console.error("Failed uploading timetable to Supabase:", err);
        }
    }

    async uploadTasksToSupabase(profileUUID = null) {
        if (!supabaseClient || !this.state.profile) return;
        const targetUUID = profileUUID || this.state.profile.id;
        if (!targetUUID) return;
        
        try {
            // Delete old tasks for this user
            await supabaseClient.from('tasks').delete().eq('profile_id', targetUUID);
            
            const rows = this.state.tasks.map(task => ({
                id: task.id,
                profile_id: targetUUID,
                title: task.title,
                subject: task.subject || "",
                priority: task.priority || "medium",
                duedate: task.dueDate,
                notes: task.notes || "",
                completed: task.completed ? true : false
            }));
            
            if (rows.length > 0) {
                const { error } = await supabaseClient.from('tasks').insert(rows);
                if (error) console.error("Error uploading tasks to Supabase:", error);
                else console.log("Successfully uploaded tasks to Supabase. Count:", rows.length);
            }
        } catch (err) {
            console.error("Failed uploading tasks to Supabase:", err);
        }
    }

    // ----------------------------------------------------
    // STATE & LOCALSTORAGE MANAGEMENT
    // ----------------------------------------------------
    loadState() {
        try {
            const savedState = localStorage.getItem('study_table_state');
            if (savedState) {
                const parsed = JSON.parse(savedState);
                this.state = { ...this.state, ...parsed };
                if (this.state.active_week === undefined || !this.state.active_week) {
                    this.state.active_week = 'A';
                }
                if (this.state.viewing_week === undefined || !this.state.viewing_week) {
                    this.state.viewing_week = 'A';
                }
                if (this.state.auto_week_switch === undefined) {
                    this.state.auto_week_switch = true;
                }
                if (this.state.last_week_monday === undefined) {
                    this.state.last_week_monday = '';
                }
                // Ensure settings and syncQueue are initialized if they were missing in saved state
                if (!this.state.settings) {
                    this.state.settings = {
                    };
                }
                if (!this.state.syncQueue) {
                    this.state.syncQueue = [];
                }
                this.state.isSyncing = false;
                // Reset timer running state on load
                this.state.pomodoro.isRunning = false;
                this.state.pomodoro.timeLeft = this.state.pomodoro.duration;

                // Ensure all loaded timetable slots and tasks have valid UUIDs for Supabase compatibility
                if (this.state.timetable_A) {
                    this.state.timetable_A.forEach(slot => {
                        if (!isValidUUID(slot.id)) slot.id = generateUUID();
                    });
                }
                if (this.state.timetable_B) {
                    this.state.timetable_B.forEach(slot => {
                        if (!isValidUUID(slot.id)) slot.id = generateUUID();
                    });
                }
                if (this.state.tasks) {
                    this.state.tasks.forEach(task => {
                        if (!isValidUUID(task.id)) task.id = generateUUID();
                    });
                }
            } else {
                this.loadMockData();
            }
        } catch (e) {
            console.error("Error loading localStorage state:", e);
            this.loadMockData();
        }
    }
    saveState() {
        try {
            localStorage.setItem('study_table_state', JSON.stringify({
                timetable_A: this.state.timetable_A,
                timetable_B: this.state.timetable_B,
                tasks: this.state.tasks,
                active_week: this.state.active_week,
                viewing_week: this.state.viewing_week,
                auto_week_switch: this.state.auto_week_switch,
                last_week_monday: this.state.last_week_monday,
                theme: this.state.theme,
                settings: this.state.settings,
                syncQueue: this.state.syncQueue,
                pomodoro: {
                    sessions: this.state.pomodoro.sessions,
                    minutes: this.state.pomodoro.minutes,
                    activeMode: this.state.pomodoro.activeMode,
                    duration: this.state.pomodoro.duration,
                    timeLeft: this.state.pomodoro.timeLeft,
                    isRunning: false
                }
            }));
        } catch (e) {
            console.error("Error saving state:", e);
        }
    }
    loadMockData(classroom = null) {
        if (!classroom && this.state.profile && this.state.profile.classroom) {
            classroom = this.state.profile.classroom;
        }
        if (!classroom) classroom = 'ม.2/3';

        // Timetable Data Arrays
        const baseA_2_1 = [
            { id: 'a_mon_1', week: 'A', name: 'ภาษาอังกฤษพื้นฐาน 3', room: '1338,1337,Lab ฟิสิกส์', teacher: 'คณะครู', day: 1, startTime: '08:00', endTime: '08:50', color: 'var(--color-blue)' },
            { id: 'a_mon_2', week: 'A', name: 'ภาษาอังกฤษพื้นฐาน 3', room: '1338,1337,Lab ฟิสิกส์', teacher: 'คณะครู', day: 1, startTime: '08:50', endTime: '09:40', color: 'var(--color-blue)' },
            { id: 'a_mon_3', week: 'A', name: 'ทักษะการใช้ภาษาอังกฤษ 3', room: '1338', teacher: 'อ.Liberty', day: 1, startTime: '09:50', endTime: '10:40', color: 'var(--color-blue)' },
            { id: 'a_mon_4', week: 'A', name: 'ทักษะการใช้ภาษาอังกฤษ 3', room: '1338', teacher: 'อ.Liberty', day: 1, startTime: '10:40', endTime: '11:30', color: 'var(--color-blue)' },
            { id: 'a_mon_5', week: 'A', name: 'คณิตศาสตร์พื้นฐาน 3', room: '1338,Lab ฟิสิกส์', teacher: 'อ.สุนทรีย์, อ.อรทัย', day: 1, startTime: '12:30', endTime: '13:20', color: 'var(--color-purple)' },
            { id: 'a_mon_6', week: 'A', name: 'ภาษาไทยพื้นฐาน 3', room: '1338', teacher: 'อ.คมสนัต์', day: 1, startTime: '13:20', endTime: '14:10', color: 'var(--color-rose)' },
            { id: 'a_mon_7', week: 'A', name: 'ประวัติศาสตร์ 3', room: '1338', teacher: 'อ.นนทพร', day: 1, startTime: '14:10', endTime: '15:00', color: 'var(--color-amber)' },
            { id: 'a_tue_1', week: 'A', name: 'ทัศนศิลป์ 3', room: 'ตึกศิลป์ ชั้น 1', teacher: 'อ.เสนีย์', day: 2, startTime: '08:00', endTime: '08:50', color: 'var(--color-rose)' },
            { id: 'a_tue_2', week: 'A', name: 'ทัศนศิลป์ 3', room: 'ตึกศิลป์ ชั้น 1', teacher: 'อ.เสนีย์', day: 2, startTime: '08:50', endTime: '09:40', color: 'var(--color-rose)' },
            { id: 'a_tue_3', week: 'A', name: 'วิทยาศาสตร์พื้นฐาน 3', room: 'Lab ชีวะ, Lab ชีวะ', teacher: 'อ.นันทิชา, อ.พุฒชฎากร', day: 2, startTime: '09:50', endTime: '10:40', color: 'var(--color-emerald)' },
            { id: 'a_tue_4', week: 'A', name: 'วิทยาศาสตร์พื้นฐาน 3', room: 'Lab ชีวะ, Lab ชีวะ', teacher: 'อ.นันทิชา, อ.พุฒชฎากร', day: 2, startTime: '10:40', endTime: '11:30', color: 'var(--color-emerald)' },
            { id: 'a_tue_5', week: 'A', name: 'การออกแบบและเทคโนโลยี 2', room: 'คอม 1-2, คอม 1-2', teacher: 'อ.ปริญญา, อ.สุรทัศน์', day: 2, startTime: '12:30', endTime: '13:20', color: 'var(--color-violet)' },
            { id: 'a_tue_6', week: 'A', name: 'การออกแบบและเทคโนโลยี 2', room: 'คอม 1-2, คอม 1-2', teacher: 'อ.ปริญญา, อ.สุรทัศน์', day: 2, startTime: '13:20', endTime: '14:10', color: 'var(--color-violet)' },
            { id: 'a_tue_7', week: 'A', name: 'สังคมศึกษาพื้นฐาน 3 (เศรษฐศาสตร์)', room: '1338', teacher: 'อ.ฐิติรัตน์', day: 2, startTime: '14:10', endTime: '15:00', color: 'var(--color-amber)' },
            { id: 'a_wed_1', week: 'A', name: 'คณิตศาสตร์พื้นฐาน 3', room: '1338,1337', teacher: 'อ.สุนทรีย์, อ.อรทัย', day: 3, startTime: '08:00', endTime: '08:50', color: 'var(--color-purple)' },
            { id: 'a_wed_2', week: 'A', name: 'พลศึกษาพื้นฐาน 3', room: 'ข้างศาลาผกาภิรมย์', teacher: 'คณะครู', day: 3, startTime: '08:50', endTime: '09:40', color: 'var(--color-violet)' },
            { id: 'a_wed_3', week: 'A', name: 'ภาษาจีนเบื้องต้น 3', room: '1343,1338,1343', teacher: 'อ.ธนิษฐา, อ.Jiaqi, อ.Shenglan', day: 3, startTime: '09:50', endTime: '10:40', color: 'var(--color-blue)' },
            { id: 'a_wed_4', week: 'A', name: 'ภาษาจีนเบื้องต้น 3', room: '1343,1338,1343', teacher: 'อ.ธนิษฐา, อ.Jiaqi, อ.Shenglan', day: 3, startTime: '10:40', endTime: '11:30', color: 'var(--color-blue)' },
            { id: 'a_wed_5', week: 'A', name: 'วิทยาศาสตร์พื้นฐาน 3', room: 'Lab ชีวะ, Lab ชีวะ', teacher: 'อ.นันทิชา', day: 3, startTime: '12:30', endTime: '13:20', color: 'var(--color-emerald)' },
            { id: 'a_wed_6', week: 'A', name: 'วิทยาศาสตร์พื้นฐาน 3', room: 'Lab ชีวะ, Lab ชีวะ', teacher: 'อ.นันทิชา, อ.พุฒชฎากร', day: 3, startTime: '13:20', endTime: '14:10', color: 'var(--color-emerald)' },
            { id: 'a_wed_7', week: 'A', name: 'ภาษาไทยพื้นฐาน 3', room: '1338', teacher: 'อ.คมสนัต์', day: 3, startTime: '14:10', endTime: '15:00', color: 'var(--color-rose)' },
            { id: 'a_thu_1', week: 'A', name: 'สังคมศึกษาพื้นฐาน 3 (เศรษฐศาสตร์)', room: '1338', teacher: 'อ.ฐิติรัตน์', day: 4, startTime: '08:00', endTime: '08:50', color: 'var(--color-amber)' },
            { id: 'a_thu_2', week: 'A', name: 'คณิตศาสตร์พื้นฐาน 3', room: '1338,1336', teacher: 'อ.สุนทรีย์, อ.อรทัย', day: 4, startTime: '08:50', endTime: '09:40', color: 'var(--color-purple)' },
            { id: 'a_thu_3', week: 'A', name: 'ภาษาอังกฤษพื้นฐาน 3', room: '1338,1337,ฝรั่งเศส', teacher: 'คณะครู', day: 4, startTime: '09:50', endTime: '10:40', color: 'var(--color-blue)' },
            { id: 'a_thu_4', week: 'A', name: 'ภาษาอังกฤษพื้นฐาน 3', room: '1338,1337,ฝรั่งเศส', teacher: 'คณะครู', day: 4, startTime: '10:40', endTime: '11:30', color: 'var(--color-blue)' },
            { id: 'a_thu_5', week: 'A', name: 'แนะแนว 2', room: '1338', teacher: 'อ.อุมาพร', day: 4, startTime: '12:30', endTime: '13:20', color: 'var(--color-blue)' },
            { id: 'a_thu_6', week: 'A', name: 'ชุมนุม', room: '', teacher: '', day: 4, startTime: '13:20', endTime: '14:10', color: 'var(--color-blue)' },
            { id: 'a_thu_7', week: 'A', name: 'ชุมนุม', room: '', teacher: '', day: 4, startTime: '14:10', endTime: '15:00', color: 'var(--color-blue)' },
            { id: 'a_fri_1', week: 'A', name: 'ภาษาไทยพื้นฐาน 3', room: '1338', teacher: 'อ.คมสนัต์', day: 5, startTime: '08:00', endTime: '08:50', color: 'var(--color-rose)' },
            { id: 'a_fri_2', week: 'A', name: 'คณิตศาสตร์เสริม 3', room: '1338,1338', teacher: 'อ.สุนทรีย์, อ.อรทัย', day: 5, startTime: '08:50', endTime: '09:40', color: 'var(--color-purple)' },
            { id: 'a_fri_3', week: 'A', name: 'สังคมศึกษาพื้นฐาน 3 (พระพุทธ)', room: '1338', teacher: 'อ.เบญจมาศ', day: 5, startTime: '09:50', endTime: '10:40', color: 'var(--color-amber)' },
            { id: 'a_fri_4', week: 'A', name: 'ลูกเสือ 2 / เนตรนารี', room: 'ห้องอาหารนักเรียน', teacher: 'คณะครู', day: 5, startTime: '10:40', endTime: '11:30', color: 'var(--color-amber)' },
            { id: 'a_fri_5', week: 'A', name: 'สุขศึกษาพื้นฐาน 3', room: '1338', teacher: 'อ.กิตติพงษ์', day: 5, startTime: '12:30', endTime: '13:20', color: 'var(--color-violet)' },
            { id: 'a_fri_6', week: 'A', name: 'วิทยาศาสตร์เพิ่มเติม 3', room: 'โสตฯ', teacher: 'คณะครู', day: 5, startTime: '13:20', endTime: '14:10', color: 'var(--color-emerald)' },
            { id: 'a_fri_7', week: 'A', name: 'วิทยาศาสตร์เพิ่มเติม 3', room: 'โสตฯ', teacher: 'คณะครู', day: 5, startTime: '14:10', endTime: '15:00', color: 'var(--color-emerald)' },
            { id: 'a_fri_8', week: 'A', name: 'วิทยาศาสตร์เพิ่มเติม 3', room: 'โสตฯ', teacher: 'คณะครู', day: 5, startTime: '15:00', endTime: '15:50', color: 'var(--color-emerald)' },
        ];

        const baseB_2_1 = [
            { id: 'b_mon_1', week: 'B', name: 'ภาษาไทยพื้นฐาน 3', room: '1338', teacher: 'อ.คมสนัต์', day: 1, startTime: '08:00', endTime: '08:50', color: 'var(--color-rose)' },
            { id: 'b_mon_2', week: 'B', name: 'แนะแนว 2', room: '1338', teacher: 'อ.อุมาพร', day: 1, startTime: '08:50', endTime: '09:40', color: 'var(--color-blue)' },
            { id: 'b_mon_3', week: 'B', name: 'ดนตรีสากล 3', room: 'ห้องอาหารนักเรียน,ดนตรีสากล,ห้องสมุด', teacher: 'คณะครู', day: 1, startTime: '09:50', endTime: '10:40', color: 'var(--color-rose)' },
            { id: 'b_mon_4', week: 'B', name: 'ดนตรีสากล 3', room: 'ห้องอาหารนักเรียน,ดนตรีสากล,ห้องสมุด', teacher: 'คณะครู', day: 1, startTime: '10:40', endTime: '11:30', color: 'var(--color-rose)' },
            { id: 'b_mon_5', week: 'B', name: 'สังคมศึกษาพื้นฐาน 3 (เศรษฐศาสตร์)', room: '1338,1338', teacher: 'อ.ฐิติรัตน์, อ.เบญจมาศ', day: 1, startTime: '12:30', endTime: '13:20', color: 'var(--color-amber)' },
            { id: 'b_mon_6', week: 'B', name: 'ลูกเสือ 2 / เนตรนารี', room: 'ห้องอาหารนักเรียน', teacher: 'คณะครู', day: 1, startTime: '13:20', endTime: '14:10', color: 'var(--color-amber)' },
            { id: 'b_mon_7', week: 'B', name: 'คณิตศาสตร์พื้นฐาน 3', room: '1338,1336', teacher: 'อ.สุนทรีย์, อ.อรทัย', day: 1, startTime: '14:10', endTime: '15:00', color: 'var(--color-purple)' },
            { id: 'b_tue_1', week: 'B', name: 'สังคมศึกษาพื้นฐาน 3 (พระพุทธ)', room: '1338', teacher: 'อ.ทรงพิสุทธิ์', day: 2, startTime: '08:00', endTime: '08:50', color: 'var(--color-amber)' },
            { id: 'b_tue_2', week: 'B', name: 'พลศึกษาพื้นฐาน 3', room: 'ข้างศาลาผกาภิรมย์', teacher: 'คณะครู', day: 2, startTime: '08:50', endTime: '09:40', color: 'var(--color-violet)' },
            { id: 'b_tue_3', week: 'B', name: 'การออกแบบและเทคโนโลยี 2', room: 'คอม 1-2', teacher: 'อ.ปริญญา, อ.สุรทัศน์', day: 2, startTime: '09:50', endTime: '10:40', color: 'var(--color-violet)' },
            { id: 'b_tue_4', week: 'B', name: 'การออกแบบและเทคโนโลยี 2', room: 'คอม 1-2', teacher: 'อ.ปริญญา, อ.สุรทัศน์', day: 2, startTime: '10:40', endTime: '11:30', color: 'var(--color-violet)' },
            { id: 'b_tue_5', week: 'B', name: 'สังคมศึกษาพื้นฐาน 3 (เศรษฐศาสตร์)', room: '1338,1338', teacher: 'อ.ฐิติรัตน์, อ.เบญจมาศ', day: 2, startTime: '12:30', endTime: '13:20', color: 'var(--color-amber)' },
            { id: 'b_tue_6', week: 'B', name: 'คณิตศาสตร์พื้นฐาน 3', room: '1338,1337', teacher: 'อ.สุนทรีย์, อ.อรทัย', day: 2, startTime: '13:20', endTime: '14:10', color: 'var(--color-purple)' },
            { id: 'b_tue_7', week: 'B', name: 'ภาษาไทยพื้นฐาน 3', room: '1338', teacher: 'อ.คมสนัต์', day: 2, startTime: '14:10', endTime: '15:00', color: 'var(--color-rose)' },
            { id: 'b_wed_1', week: 'B', name: 'ภาษาจีนเบื้องต้น 3', room: '1343,1338,1343', teacher: 'อ.ธนิษฐา, อ.Jiaqi, อ.Shenglan', day: 3, startTime: '08:00', endTime: '08:50', color: 'var(--color-blue)' },
            { id: 'b_wed_2', week: 'B', name: 'ภาษาจีนเบื้องต้น 3', room: '1343,1338,1343', teacher: 'อ.ธนิษฐา, อ.Jiaqi, อ.Shenglan', day: 3, startTime: '08:50', endTime: '09:40', color: 'var(--color-blue)' },
            { id: 'b_wed_3', week: 'B', name: 'ทักษะพื้นฐานอาชีพ 3', room: 'วิชาชีพ,วิชาชีพ,1338', teacher: 'อ.อาภรณ์, อ.ศุภดิศ, อ.วิณฑิศา', day: 3, startTime: '09:50', endTime: '10:40', color: 'var(--color-violet)' },
            { id: 'b_wed_4', week: 'B', name: 'ทักษะพื้นฐานอาชีพ 3', room: 'วิชาชีพ,วิชาชีพ,1338', teacher: 'อ.อาภรณ์, อ.ศุภดิศ, อ.วิณฑิศา', day: 3, startTime: '10:40', endTime: '11:30', color: 'var(--color-violet)' },
            { id: 'b_wed_5', week: 'B', name: 'วิทยาศาสตร์พื้นฐาน 3', room: 'Lab ชีวะ', teacher: 'อ.นันทิชา, อ.พุฒชฎากร', day: 3, startTime: '12:30', endTime: '13:20', color: 'var(--color-emerald)' },
            { id: 'b_wed_6', week: 'B', name: 'วิทยาศาสตร์พื้นฐาน 3', room: 'Lab ชีวะ', teacher: 'อ.นันทิชา, อ.พุฒชฎากร', day: 3, startTime: '13:20', endTime: '14:10', color: 'var(--color-emerald)' },
            { id: 'b_wed_7', week: 'B', name: 'ประวัติศาสตร์ 3', room: '1338', teacher: 'อ.นนทพร', day: 3, startTime: '14:10', endTime: '15:00', color: 'var(--color-amber)' },
            { id: 'b_thu_1', week: 'B', name: 'ภาษาไทยพื้นฐาน 3', room: '1338', teacher: 'อ.คมสนัต์', day: 4, startTime: '08:00', endTime: '08:50', color: 'var(--color-rose)' },
            { id: 'b_thu_2', week: 'B', name: 'สุขศึกษาพื้นฐาน 3', room: '1338', teacher: 'อ.กิตติพงษ์', day: 4, startTime: '08:50', endTime: '09:40', color: 'var(--color-violet)' },
            { id: 'b_thu_3', week: 'B', name: 'ภาษาอังกฤษพื้นฐาน 3', room: '1338,1337,1335', teacher: 'คณะครู', day: 4, startTime: '09:50', endTime: '10:40', color: 'var(--color-blue)' },
            { id: 'b_thu_4', week: 'B', name: 'ภาษาอังกฤษพื้นฐาน 3', room: '1338,1337,1335', teacher: 'คณะครู', day: 4, startTime: '10:40', endTime: '11:30', color: 'var(--color-blue)' },
            { id: 'b_thu_5', week: 'B', name: 'คณิตศาสตร์พื้นฐาน 3', room: '1338,1344', teacher: 'อ.สุนทรีย์, อ.อรทัย', day: 4, startTime: '12:30', endTime: '13:20', color: 'var(--color-purple)' },
            { id: 'b_thu_6', week: 'B', name: 'ชุมนุม', room: '', teacher: '', day: 4, startTime: '13:20', endTime: '14:10', color: 'var(--color-blue)' },
            { id: 'b_thu_7', week: 'B', name: 'ชุมนุม', room: '', teacher: '', day: 4, startTime: '14:10', endTime: '15:00', color: 'var(--color-blue)' },
            { id: 'b_fri_1', week: 'B', name: 'ทักษะการใช้ภาษาอังกฤษ 3', room: '1338', teacher: 'อ.เตชิต', day: 5, startTime: '08:00', endTime: '08:50', color: 'var(--color-blue)' },
            { id: 'b_fri_2', week: 'B', name: 'ทักษะการใช้ภาษาอังกฤษ 3', room: '1338', teacher: 'อ.เตชิต', day: 5, startTime: '08:50', endTime: '09:40', color: 'var(--color-blue)' },
            { id: 'b_fri_3', week: 'B', name: 'ดนตรีนาฏศิลป์ไทย 3', room: 'ตึกศิลป์', teacher: 'คณะครู', day: 5, startTime: '09:50', endTime: '10:40', color: 'var(--color-rose)' },
            { id: 'b_fri_4', week: 'B', name: 'ดนตรีนาฏศิลป์ไทย 3', room: 'ตึกศิลป์', teacher: 'คณะครู', day: 5, startTime: '10:40', endTime: '11:30', color: 'var(--color-rose)' },
            { id: 'b_fri_5', week: 'B', name: 'คณิตศาสตร์เสริม 3', room: '1338,1334', teacher: 'อ.สุนทรีย์, อ.อรทัย', day: 5, startTime: '12:30', endTime: '13:20', color: 'var(--color-purple)' },
            { id: 'b_fri_6', week: 'B', name: 'วิทยาศาสตร์เพิ่มเติม 3', room: 'โสตฯ', teacher: 'คณะครู', day: 5, startTime: '13:20', endTime: '14:10', color: 'var(--color-emerald)' },
            { id: 'b_fri_7', week: 'B', name: 'วิทยาศาสตร์เพิ่มเติม 3', room: 'โสตฯ', teacher: 'คณะครู', day: 5, startTime: '14:10', endTime: '15:00', color: 'var(--color-emerald)' },
            { id: 'b_fri_8', week: 'B', name: 'วิทยาศาสตร์เพิ่มเติม 3', room: 'โสตฯ', teacher: 'คณะครู', day: 5, startTime: '15:00', endTime: '15:50', color: 'var(--color-emerald)' },
        ];

        const baseA_2_2 = [
            { id: 'a_mon_1', week: 'A', name: 'ภาษาอังกฤษพื้นฐาน 3', room: '1338,1337,Lab ฟิสิกส์', teacher: 'คณะครู', day: 1, startTime: '08:00', endTime: '08:50', color: 'var(--color-blue)' },
            { id: 'a_mon_2', week: 'A', name: 'ภาษาอังกฤษพื้นฐาน 3', room: '1338,1337,Lab ฟิสิกส์', teacher: 'คณะครู', day: 1, startTime: '08:50', endTime: '09:40', color: 'var(--color-blue)' },
            { id: 'a_mon_3', week: 'A', name: 'ภาษาไทยพื้นฐาน 3', room: '1337', teacher: 'อ.คมสนัต์', day: 1, startTime: '09:50', endTime: '10:40', color: 'var(--color-rose)' },
            { id: 'a_mon_4', week: 'A', name: 'ประวัติศาสตร์ 3', room: '1337', teacher: 'อ.นนทพร', day: 1, startTime: '10:40', endTime: '11:30', color: 'var(--color-amber)' },
            { id: 'a_mon_5', week: 'A', name: 'สังคมศึกษาพื้นฐาน 3 (เศรษฐศาสตร์)', room: '1337', teacher: 'อ.ฐิติรัตน์', day: 1, startTime: '12:30', endTime: '13:20', color: 'var(--color-amber)' },
            { id: 'a_mon_6', week: 'A', name: 'คณิตศาสตร์พื้นฐาน 3', room: '1337,Lab ฟิสิกส์', teacher: 'อ.สุนทรีย์, อ.อรทัย', day: 1, startTime: '13:20', endTime: '14:10', color: 'var(--color-purple)' },
            { id: 'a_mon_7', week: 'A', name: 'แนะแนว 2', room: '1337', teacher: 'อ.อุมาพร', day: 1, startTime: '14:10', endTime: '15:00', color: 'var(--color-blue)' },
            { id: 'a_tue_1', week: 'A', name: 'การออกแบบและเทคโนโลยี 2', room: 'คอม 1-2, คอม 1-2', teacher: 'อ.ปริญญา, อ.สุรทัศน์', day: 2, startTime: '08:00', endTime: '08:50', color: 'var(--color-violet)' },
            { id: 'a_tue_2', week: 'A', name: 'การออกแบบและเทคโนโลยี 2', room: 'คอม 1-2, คอม 1-2', teacher: 'อ.ปริญญา, อ.สุรทัศน์', day: 2, startTime: '08:50', endTime: '09:40', color: 'var(--color-violet)' },
            { id: 'a_tue_3', week: 'A', name: 'ทัศนศิลป์ 3', room: 'ตึกศิลป์ ชั้น 1', teacher: 'อ.เสนีย์', day: 2, startTime: '09:50', endTime: '10:40', color: 'var(--color-rose)' },
            { id: 'a_tue_4', week: 'A', name: 'ทัศนศิลป์ 3', room: 'ตึกศิลป์ ชั้น 1', teacher: 'อ.เสนีย์', day: 2, startTime: '10:40', endTime: '11:30', color: 'var(--color-rose)' },
            { id: 'a_tue_5', week: 'A', name: 'สุขศึกษาพื้นฐาน 3', room: '1337', teacher: 'อ.กิตติพงษ์', day: 2, startTime: '12:30', endTime: '13:20', color: 'var(--color-violet)' },
            { id: 'a_tue_6', week: 'A', name: 'วิทยาศาสตร์พื้นฐาน 3', room: 'Lab ชีวะ, Lab ชีวะ', teacher: 'อ.นันทิชา, อ.พุฒชฎากร', day: 2, startTime: '13:20', endTime: '14:10', color: 'var(--color-emerald)' },
            { id: 'a_tue_7', week: 'A', name: 'วิทยาศาสตร์พื้นฐาน 3', room: 'Lab ชีวะ, Lab ชีวะ', teacher: 'อ.นันทิชา, อ.พุฒชฎากร', day: 2, startTime: '14:10', endTime: '15:00', color: 'var(--color-emerald)' },
            { id: 'a_wed_1', week: 'A', name: 'วิทยาศาสตร์พื้นฐาน 3', room: 'Lab ชีวะ, Lab ชีวะ', teacher: 'อ.นันทิชา, อ.พุฒชฎากร', day: 3, startTime: '08:00', endTime: '08:50', color: 'var(--color-emerald)' },
            { id: 'a_wed_2', week: 'A', name: 'วิทยาศาสตร์พื้นฐาน 3', room: 'Lab ชีวะ, Lab ชีวะ', teacher: 'อ.นันทิชา, อ.พุฒชฎากร', day: 3, startTime: '08:50', endTime: '09:40', color: 'var(--color-emerald)' },
            { id: 'a_wed_3', week: 'A', name: 'พลศึกษาพื้นฐาน 3', room: 'ข้างศาลาผกาภิรมย์', teacher: 'คณะครู', day: 3, startTime: '09:50', endTime: '10:40', color: 'var(--color-violet)' },
            { id: 'a_wed_4', week: 'A', name: 'ภาษาไทยพื้นฐาน 3', room: '1337', teacher: 'อ.คมสนัต์', day: 3, startTime: '10:40', endTime: '11:30', color: 'var(--color-rose)' },
            { id: 'a_wed_5', week: 'A', name: 'ทักษะการใช้ภาษาอังกฤษ 3', room: '1337', teacher: 'อ.Liberty', day: 3, startTime: '12:30', endTime: '13:20', color: 'var(--color-blue)' },
            { id: 'a_wed_6', week: 'A', name: 'ทักษะการใช้ภาษาอังกฤษ 3', room: '1337', teacher: 'อ.Liberty', day: 3, startTime: '13:20', endTime: '14:10', color: 'var(--color-blue)' },
            { id: 'a_wed_7', week: 'A', name: 'คณิตศาสตร์พื้นฐาน 3', room: '1337,ฝรั่งเศส', teacher: 'อ.สุนทรีย์, อ.อรทัย', day: 3, startTime: '14:10', endTime: '15:00', color: 'var(--color-purple)' },
            { id: 'a_thu_1', week: 'A', name: 'คณิตศาสตร์พื้นฐาน 3', room: '1337,1338', teacher: 'อ.สุนทรีย์, อ.อรทัย', day: 4, startTime: '08:00', endTime: '08:50', color: 'var(--color-purple)' },
            { id: 'a_thu_2', week: 'A', name: 'สังคมศึกษาพื้นฐาน 3 (เศรษฐศาสตร์)', room: '1337', teacher: 'อ.ฐิติรัตน์', day: 4, startTime: '08:50', endTime: '09:40', color: 'var(--color-amber)' },
            { id: 'a_thu_3', week: 'A', name: 'ภาษาอังกฤษพื้นฐาน 3', room: '1338,1337,ฝรั่งเศส', teacher: 'คณะครู', day: 4, startTime: '09:50', endTime: '10:40', color: 'var(--color-blue)' },
            { id: 'a_thu_4', week: 'A', name: 'ภาษาอังกฤษพื้นฐาน 3', room: '1338,1337,ฝรั่งเศส', teacher: 'คณะครู', day: 4, startTime: '10:40', endTime: '11:30', color: 'var(--color-blue)' },
            { id: 'a_thu_5', week: 'A', name: 'ภาษาไทยพื้นฐาน 3', room: '1337', teacher: 'อ.คมสนัต์', day: 4, startTime: '12:30', endTime: '13:20', color: 'var(--color-rose)' },
            { id: 'a_thu_6', week: 'A', name: 'ชุมนุม', room: '', teacher: '', day: 4, startTime: '13:20', endTime: '14:10', color: 'var(--color-blue)' },
            { id: 'a_thu_7', week: 'A', name: 'ชุมนุม', room: '', teacher: '', day: 4, startTime: '14:10', endTime: '15:00', color: 'var(--color-blue)' },
            { id: 'a_fri_1', week: 'A', name: 'ลูกเสือ 2 / เนตรนารี', room: 'ห้องอาหารนักเรียน', teacher: 'คณะครู', day: 5, startTime: '08:00', endTime: '08:50', color: 'var(--color-amber)' },
            { id: 'a_fri_2', week: 'A', name: 'สังคมศึกษาพื้นฐาน 3 (พระพุทธ)', room: '1337', teacher: 'อ.เบญจมาศ', day: 5, startTime: '08:50', endTime: '09:40', color: 'var(--color-amber)' },
            { id: 'a_fri_3', week: 'A', name: 'ภาษาจีนเบื้องต้น 3', room: '1343,1337,1343', teacher: 'อ.ธนิษฐา, อ.Jiaqi, อ.Shenglan', day: 5, startTime: '09:50', endTime: '10:40', color: 'var(--color-blue)' },
            { id: 'a_fri_4', week: 'A', name: 'ภาษาจีนเบื้องต้น 3', room: '1343,1337,1343', teacher: 'อ.ธนิษฐา, อ.Jiaqi, อ.Shenglan', day: 5, startTime: '10:40', endTime: '11:30', color: 'var(--color-blue)' },
            { id: 'a_fri_5', week: 'A', name: 'คณิตศาสตร์เสริม 3', room: '1337,1132', teacher: 'อ.สุนทรีย์, อ.อรทัย', day: 5, startTime: '12:30', endTime: '13:20', color: 'var(--color-purple)' },
            { id: 'a_fri_6', week: 'A', name: 'วิทยาศาสตร์เพิ่มเติม 3', room: 'โสตฯ', teacher: 'คณะครู', day: 5, startTime: '13:20', endTime: '14:10', color: 'var(--color-emerald)' },
            { id: 'a_fri_7', week: 'A', name: 'วิทยาศาสตร์เพิ่มเติม 3', room: 'โสตฯ', teacher: 'คณะครู', day: 5, startTime: '14:10', endTime: '15:00', color: 'var(--color-emerald)' },
            { id: 'a_fri_8', week: 'A', name: 'วิทยาศาสตร์เพิ่มเติม 3', room: 'โสตฯ', teacher: 'คณะครู', day: 5, startTime: '15:00', endTime: '15:50', color: 'var(--color-emerald)' },
        ];

        const baseB_2_2 = [
            { id: 'b_mon_1', week: 'B', name: 'ทักษะการใช้ภาษาอังกฤษ 3', room: '1337', teacher: 'อ.เตชิต', day: 1, startTime: '08:00', endTime: '08:50', color: 'var(--color-blue)' },
            { id: 'b_mon_2', week: 'B', name: 'ทักษะการใช้ภาษาอังกฤษ 3', room: '1337', teacher: 'อ.เตชิต', day: 1, startTime: '08:50', endTime: '09:40', color: 'var(--color-blue)' },
            { id: 'b_mon_3', week: 'B', name: 'ดนตรีสากล 3', room: 'ห้องอาหารนักเรียน,ดนตรีสากล,ห้องสมุด', teacher: 'คณะครู', day: 1, startTime: '09:50', endTime: '10:40', color: 'var(--color-rose)' },
            { id: 'b_mon_4', week: 'B', name: 'ดนตรีสากล 3', room: 'ห้องอาหารนักเรียน,ดนตรีสากล,ห้องสมุด', teacher: 'คณะครู', day: 1, startTime: '10:40', endTime: '11:30', color: 'var(--color-rose)' },
            { id: 'b_mon_5', week: 'B', name: 'ลูกเสือ 2 / เนตรนารี', room: 'ห้องอาหารนักเรียน', teacher: 'คณะครู', day: 1, startTime: '12:30', endTime: '13:20', color: 'var(--color-amber)' },
            { id: 'b_mon_6', week: 'B', name: 'คณิตศาสตร์พื้นฐาน 3', room: '1337,1338', teacher: 'อ.สุนทรีย์, อ.อรทัย', day: 1, startTime: '13:20', endTime: '14:10', color: 'var(--color-purple)' },
            { id: 'b_mon_7', week: 'B', name: 'ภาษาไทยพื้นฐาน 3', room: '1337', teacher: 'อ.คมสนัต์', day: 1, startTime: '14:10', endTime: '15:00', color: 'var(--color-rose)' },
            { id: 'b_tue_1', week: 'B', name: 'การออกแบบและเทคโนโลยี 2', room: 'คอม 1-2', teacher: 'อ.ปริญญา, อ.สุรทัศน์', day: 2, startTime: '08:00', endTime: '08:50', color: 'var(--color-violet)' },
            { id: 'b_tue_2', week: 'B', name: 'การออกแบบและเทคโนโลยี 2', room: 'คอม 1-2', teacher: 'อ.ปริญญา, อ.สุรทัศน์', day: 2, startTime: '08:50', endTime: '09:40', color: 'var(--color-violet)' },
            { id: 'b_tue_3', week: 'B', name: 'สังคมศึกษาพื้นฐาน 3 (พระพุทธ)', room: '1337', teacher: 'อ.ทรงพิสุทธิ์', day: 2, startTime: '09:50', endTime: '10:40', color: 'var(--color-amber)' },
            { id: 'b_tue_4', week: 'B', name: 'สังคมศึกษาพื้นฐาน 3 (เศรษฐศาสตร์)', room: '1337,1337', teacher: 'อ.ฐิติรัตน์, อ.เบญจมาศ', day: 2, startTime: '10:40', endTime: '11:30', color: 'var(--color-amber)' },
            { id: 'b_tue_5', week: 'B', name: 'สุขศึกษาพื้นฐาน 3', room: '1337', teacher: 'อ.กิตติพงษ์', day: 2, startTime: '12:30', endTime: '13:20', color: 'var(--color-violet)' },
            { id: 'b_tue_6', week: 'B', name: 'พลศึกษาพื้นฐาน 3', room: 'ข้างศาลาผกาภิรมย์', teacher: 'คณะครู', day: 2, startTime: '13:20', endTime: '14:10', color: 'var(--color-violet)' },
            { id: 'b_tue_7', week: 'B', name: 'คณิตศาสตร์พื้นฐาน 3', room: '1337,1336', teacher: 'อ.สุนทรีย์, อ.อรทัย', day: 2, startTime: '14:10', endTime: '15:00', color: 'var(--color-purple)' },
            { id: 'b_wed_1', week: 'B', name: 'วิทยาศาสตร์พื้นฐาน 3', room: 'Lab ชีวะ', teacher: 'อ.นันทิชา, อ.พุฒชฎากร', day: 3, startTime: '08:00', endTime: '08:50', color: 'var(--color-emerald)' },
            { id: 'b_wed_2', week: 'B', name: 'วิทยาศาสตร์พื้นฐาน 3', room: 'Lab ชีวะ', teacher: 'อ.นันทิชา, อ.พุฒชฎากร', day: 3, startTime: '08:50', endTime: '09:40', color: 'var(--color-emerald)' },
            { id: 'b_wed_3', week: 'B', name: 'ภาษาจีนเบื้องต้น 3', room: '1343,1337,1343', teacher: 'อ.ธนิษฐา, อ.Jiaqi, อ.Shenglan', day: 3, startTime: '09:50', endTime: '10:40', color: 'var(--color-blue)' },
            { id: 'b_wed_4', week: 'B', name: 'ภาษาจีนเบื้องต้น 3', room: '1343,1337,1343', teacher: 'อ.ธนิษฐา, อ.Jiaqi, อ.Shenglan', day: 3, startTime: '10:40', endTime: '11:30', color: 'var(--color-blue)' },
            { id: 'b_wed_5', week: 'B', name: 'ทักษะพื้นฐานอาชีพ 3', room: 'วิชาชีพ,วิชาชีพ,1337', teacher: 'อ.อาภรณ์, อ.ศุภดิศ, อ.วิณฑิศา', day: 3, startTime: '12:30', endTime: '13:20', color: 'var(--color-violet)' },
            { id: 'b_wed_6', week: 'B', name: 'ทักษะพื้นฐานอาชีพ 3', room: 'วิชาชีพ,วิชาชีพ,1337', teacher: 'อ.อาภรณ์, อ.ศุภดิศ, อ.วิณฑิศา', day: 3, startTime: '13:20', endTime: '14:10', color: 'var(--color-violet)' },
            { id: 'b_wed_7', week: 'B', name: 'ภาษาไทยพื้นฐาน 3', room: '1337', teacher: 'อ.คมสนัต์', day: 3, startTime: '14:10', endTime: '15:00', color: 'var(--color-rose)' },
            { id: 'b_thu_1', week: 'B', name: 'คณิตศาสตร์พื้นฐาน 3', room: '1337,1335', teacher: 'อ.สุนทรีย์, อ.อรทัย', day: 4, startTime: '08:00', endTime: '08:50', color: 'var(--color-purple)' },
            { id: 'b_thu_2', week: 'B', name: 'ภาษาไทยพื้นฐาน 3', room: '1337', teacher: 'อ.คมสนัต์', day: 4, startTime: '08:50', endTime: '09:40', color: 'var(--color-rose)' },
            { id: 'b_thu_3', week: 'B', name: 'ภาษาอังกฤษพื้นฐาน 3', room: '1338,1337,1335', teacher: 'คณะครู', day: 4, startTime: '09:50', endTime: '10:40', color: 'var(--color-blue)' },
            { id: 'b_thu_4', week: 'B', name: 'ภาษาอังกฤษพื้นฐาน 3', room: '1338,1337,1335', teacher: 'คณะครู', day: 4, startTime: '10:40', endTime: '11:30', color: 'var(--color-blue)' },
            { id: 'b_thu_5', week: 'B', name: 'แนะแนว 2', room: '1337', teacher: 'อ.อุมาพร', day: 4, startTime: '12:30', endTime: '13:20', color: 'var(--color-blue)' },
            { id: 'b_thu_6', week: 'B', name: 'ชุมนุม', room: '', teacher: '', day: 4, startTime: '13:20', endTime: '14:10', color: 'var(--color-blue)' },
            { id: 'b_thu_7', week: 'B', name: 'ชุมนุม', room: '', teacher: '', day: 4, startTime: '14:10', endTime: '15:00', color: 'var(--color-blue)' },
            { id: 'b_fri_1', week: 'B', name: 'ประวัติศาสตร์ 3', room: '1337', teacher: 'อ.นนทพร', day: 5, startTime: '08:00', endTime: '08:50', color: 'var(--color-amber)' },
            { id: 'b_fri_2', week: 'B', name: 'คณิตศาสตร์เสริม 3', room: '1337,1335', teacher: 'อ.สุนทรีย์, อ.อรทัย', day: 5, startTime: '08:50', endTime: '09:40', color: 'var(--color-purple)' },
            { id: 'b_fri_3', week: 'B', name: 'ดนตรีนาฏศิลป์ไทย 3', room: 'ตึกศิลป์', teacher: 'คณะครู', day: 5, startTime: '09:50', endTime: '10:40', color: 'var(--color-rose)' },
            { id: 'b_fri_4', week: 'B', name: 'ดนตรีนาฏศิลป์ไทย 3', room: 'ตึกศิลป์', teacher: 'คณะครู', day: 5, startTime: '10:40', endTime: '11:30', color: 'var(--color-rose)' },
            { id: 'b_fri_5', week: 'B', name: 'สังคมศึกษาพื้นฐาน 3 (เศรษฐศาสตร์)', room: '1337,1337', teacher: 'อ.ฐิติรัตน์, อ.เบญจมาศ', day: 5, startTime: '12:30', endTime: '13:20', color: 'var(--color-amber)' },
            { id: 'b_fri_6', week: 'B', name: 'วิทยาศาสตร์เพิ่มเติม 3', room: 'โสตฯ', teacher: 'คณะครู', day: 5, startTime: '13:20', endTime: '14:10', color: 'var(--color-emerald)' },
            { id: 'b_fri_7', week: 'B', name: 'วิทยาศาสตร์เพิ่มเติม 3', room: 'โสตฯ', teacher: 'คณะครู', day: 5, startTime: '14:10', endTime: '15:00', color: 'var(--color-emerald)' },
            { id: 'b_fri_8', week: 'B', name: 'วิทยาศาสตร์เพิ่มเติม 3', room: 'โสตฯ', teacher: 'คณะครู', day: 5, startTime: '15:00', endTime: '15:50', color: 'var(--color-emerald)' },
        ];

        const baseA_2_3 = [
            { id: 'a_mon_1', week: 'A', name: 'ภาษาอังกฤษพื้นฐาน 3', room: '1338,1337,Lab ฟิสิกส์', teacher: 'คณะครู', day: 1, startTime: '08:00', endTime: '08:50', color: 'var(--color-blue)' },
            { id: 'a_mon_2', week: 'A', name: 'ภาษาอังกฤษพื้นฐาน 3', room: '1338,1337,Lab ฟิสิกส์', teacher: 'คณะครู', day: 1, startTime: '08:50', endTime: '09:40', color: 'var(--color-blue)' },
            { id: 'a_mon_3', week: 'A', name: 'ประวัติศาสตร์ 3', room: '1336', teacher: 'อ.นนทพร', day: 1, startTime: '09:50', endTime: '10:40', color: 'var(--color-amber)' },
            { id: 'a_mon_4', week: 'A', name: 'ภาษาไทยพื้นฐาน 3', room: '1336', teacher: 'อ.คมสนัต์', day: 1, startTime: '10:40', endTime: '11:30', color: 'var(--color-rose)' },
            { id: 'a_mon_5', week: 'A', name: 'แนะแนว 2', room: '1336', teacher: 'อ.อุมาพร', day: 1, startTime: '12:30', endTime: '13:20', color: 'var(--color-blue)' },
            { id: 'a_mon_6', week: 'A', name: 'สังคมศึกษาพื้นฐาน 3 (เศรษฐศาสตร์)', room: '1336', teacher: 'อ.ฐิติรัตน์', day: 1, startTime: '13:20', endTime: '14:10', color: 'var(--color-amber)' },
            { id: 'a_mon_7', week: 'A', name: 'คณิตศาสตร์พื้นฐาน 3', room: '1336,Lab ฟิสิกส์', teacher: 'อ.สุนทรีย์, อ.อรทัย', day: 1, startTime: '14:10', endTime: '15:00', color: 'var(--color-purple)' },
            { id: 'a_tue_1', week: 'A', name: 'วิทยาศาสตร์พื้นฐาน 3', room: 'Lab ชีวะ, Lab ชีวะ', teacher: 'อ.นันทิชา, อ.พุฒชฎากร', day: 2, startTime: '08:00', endTime: '08:50', color: 'var(--color-emerald)' },
            { id: 'a_tue_2', week: 'A', name: 'วิทยาศาสตร์พื้นฐาน 3', room: 'Lab ชีวะ, Lab ชีวะ', teacher: 'อ.นันทิชา, อ.พุฒชฎากร', day: 2, startTime: '08:50', endTime: '09:40', color: 'var(--color-emerald)' },
            { id: 'a_tue_3', week: 'A', name: 'การออกแบบและเทคโนโลยี 2', room: 'คอม 1-2, คอม 1-2', teacher: 'อ.ปริญญา, อ.สุรทัศน์', day: 2, startTime: '09:50', endTime: '10:40', color: 'var(--color-violet)' },
            { id: 'a_tue_4', week: 'A', name: 'การออกแบบและเทคโนโลยี 2', room: 'คอม 1-2, คอม 1-2', teacher: 'อ.ปริญญา, อ.สุรทัศน์', day: 2, startTime: '10:40', endTime: '11:30', color: 'var(--color-violet)' },
            { id: 'a_tue_5', week: 'A', name: 'ทัศนศิลป์ 3', room: 'ตึกศิลป์ ชั้น 1', teacher: 'อ.เสนีย์', day: 2, startTime: '12:30', endTime: '13:20', color: 'var(--color-rose)' },
            { id: 'a_tue_6', week: 'A', name: 'ทัศนศิลป์ 3', room: 'ตึกศิลป์ ชั้น 1', teacher: 'อ.เสนีย์', day: 2, startTime: '13:20', endTime: '14:10', color: 'var(--color-rose)' },
            { id: 'a_tue_7', week: 'A', name: 'สุขศึกษาพื้นฐาน 3', room: '1336', teacher: 'อ.กิตติพงษ์', day: 2, startTime: '14:10', endTime: '15:00', color: 'var(--color-violet)' },
            { id: 'a_wed_1', week: 'A', name: 'พลศึกษาพื้นฐาน 3', room: 'ข้างศาลาผกาภิรมย์', teacher: 'คณะครู', day: 3, startTime: '08:00', endTime: '08:50', color: 'var(--color-violet)' },
            { id: 'a_wed_2', week: 'A', name: 'คณิตศาสตร์พื้นฐาน 3', room: '1336,1337', teacher: 'อ.สุนทรีย์, อ.อรทัย', day: 3, startTime: '08:50', endTime: '09:40', color: 'var(--color-purple)' },
            { id: 'a_wed_3', week: 'A', name: 'ทักษะการใช้ภาษาอังกฤษ 3', room: '1336', teacher: 'อ.Liberty', day: 3, startTime: '09:50', endTime: '10:40', color: 'var(--color-blue)' },
            { id: 'a_wed_4', week: 'A', name: 'ทักษะการใช้ภาษาอังกฤษ 3', room: '1336', teacher: 'อ.Liberty', day: 3, startTime: '10:40', endTime: '11:30', color: 'var(--color-blue)' },
            { id: 'a_wed_5', week: 'A', name: 'ภาษาไทยพื้นฐาน 3', room: '1336', teacher: 'อ.คมสนัต์', day: 3, startTime: '12:30', endTime: '13:20', color: 'var(--color-rose)' },
            { id: 'a_wed_6', week: 'A', name: 'ภาษาจีนเบื้องต้น 3', room: '1343,1336,1343', teacher: 'อ.ธนิษฐา, อ.Jiaqi, อ.Shenglan', day: 3, startTime: '13:20', endTime: '14:10', color: 'var(--color-blue)' },
            { id: 'a_wed_7', week: 'A', name: 'ภาษาจีนเบื้องต้น 3', room: '1343,1336,1343', teacher: 'อ.ธนิษฐา, อ.Jiaqi, อ.Shenglan', day: 3, startTime: '14:10', endTime: '15:00', color: 'var(--color-blue)' },
            { id: 'a_thu_1', week: 'A', name: 'วิทยาศาสตร์พื้นฐาน 3', room: 'Lab ชีวะ, Lab ชีวะ', teacher: 'อ.นันทิชา, อ.พุฒชฎากร', day: 4, startTime: '08:00', endTime: '08:50', color: 'var(--color-emerald)' },
            { id: 'a_thu_2', week: 'A', name: 'วิทยาศาสตร์พื้นฐาน 3', room: 'Lab ชีวะ, Lab ชีวะ', teacher: 'อ.นันทิชา, อ.พุฒชฎากร', day: 4, startTime: '08:50', endTime: '09:40', color: 'var(--color-emerald)' },
            { id: 'a_thu_3', week: 'A', name: 'ภาษาอังกฤษพื้นฐาน 3', room: '1338,1337,ฝรั่งเศส', teacher: 'คณะครู', day: 4, startTime: '09:50', endTime: '10:40', color: 'var(--color-blue)' },
            { id: 'a_thu_4', week: 'A', name: 'ภาษาอังกฤษพื้นฐาน 3', room: '1338,1337,ฝรั่งเศส', teacher: 'คณะครู', day: 4, startTime: '10:40', endTime: '11:30', color: 'var(--color-blue)' },
            { id: 'a_thu_5', week: 'A', name: 'คณิตศาสตร์พื้นฐาน 3', room: '1336,ฝรั่งเศส', teacher: 'อ.สุนทรีย์, อ.อรทัย', day: 4, startTime: '12:30', endTime: '13:20', color: 'var(--color-purple)' },
            { id: 'a_thu_6', week: 'A', name: 'ชุมนุม', room: '', teacher: '', day: 4, startTime: '13:20', endTime: '14:10', color: 'var(--color-blue)' },
            { id: 'a_thu_7', week: 'A', name: 'ชุมนุม', room: '', teacher: '', day: 4, startTime: '14:10', endTime: '15:00', color: 'var(--color-blue)' },
            { id: 'a_fri_1', week: 'A', name: 'สังคมศึกษาพื้นฐาน 3 (พระพุทธ)', room: '1336', teacher: 'อ.เบญจมาศ', day: 5, startTime: '08:00', endTime: '08:50', color: 'var(--color-amber)' },
            { id: 'a_fri_2', week: 'A', name: 'ลูกเสือ 2 / เนตรนารี', room: 'ห้องอาหารนักเรียน', teacher: 'คณะครู', day: 5, startTime: '08:50', endTime: '09:40', color: 'var(--color-amber)' },
            { id: 'a_fri_3', week: 'A', name: 'คณิตศาสตร์เสริม 3', room: '1336,1331', teacher: 'อ.สุนทรีย์, อ.อรทัย', day: 5, startTime: '09:50', endTime: '10:40', color: 'var(--color-purple)' },
            { id: 'a_fri_4', week: 'A', name: 'ภาษาไทยพื้นฐาน 3', room: '1336', teacher: 'อ.คมสนัต์', day: 5, startTime: '10:40', endTime: '11:30', color: 'var(--color-rose)' },
            { id: 'a_fri_5', week: 'A', name: 'สังคมศึกษาพื้นฐาน 3 (เศรษฐศาสตร์)', room: '1336', teacher: 'อ.ฐิติรัตน์', day: 5, startTime: '12:30', endTime: '13:20', color: 'var(--color-amber)' },
            { id: 'a_fri_6', week: 'A', name: 'วิทยาศาสตร์เพิ่มเติม 3', room: 'โสตฯ', teacher: 'คณะครู', day: 5, startTime: '13:20', endTime: '14:10', color: 'var(--color-emerald)' },
            { id: 'a_fri_7', week: 'A', name: 'วิทยาศาสตร์เพิ่มเติม 3', room: 'โสตฯ', teacher: 'คณะครู', day: 5, startTime: '14:10', endTime: '15:00', color: 'var(--color-emerald)' },
            { id: 'a_fri_8', week: 'A', name: 'วิทยาศาสตร์เพิ่มเติม 3', room: 'โสตฯ', teacher: 'คณะครู', day: 5, startTime: '15:00', endTime: '15:50', color: 'var(--color-emerald)' },
        ];

        const baseB_2_3 = [
            { id: 'b_mon_1', week: 'B', name: 'แนะแนว 2', room: '1336', teacher: 'อ.อุมาพร', day: 1, startTime: '08:00', endTime: '08:50', color: 'var(--color-blue)' },
            { id: 'b_mon_2', week: 'B', name: 'ภาษาไทยพื้นฐาน 3', room: '1336', teacher: 'อ.คมสนัต์', day: 1, startTime: '08:50', endTime: '09:40', color: 'var(--color-rose)' },
            { id: 'b_mon_3', week: 'B', name: 'ดนตรีสากล 3', room: 'ห้องอาหารนักเรียน,ดนตรีสากล,ห้องสมุด', teacher: 'คณะครู', day: 1, startTime: '09:50', endTime: '10:40', color: 'var(--color-rose)' },
            { id: 'b_mon_4', week: 'B', name: 'ดนตรีสากล 3', room: 'ห้องอาหารนักเรียน,ดนตรีสากล,ห้องสมุด', teacher: 'คณะครู', day: 1, startTime: '10:40', endTime: '11:30', color: 'var(--color-rose)' },
            { id: 'b_mon_5', week: 'B', name: 'คณิตศาสตร์พื้นฐาน 3', room: '1336,1337', teacher: 'อ.สุนทรีย์, อ.อรทัย', day: 1, startTime: '12:30', endTime: '13:20', color: 'var(--color-purple)' },
            { id: 'b_mon_6', week: 'B', name: 'สังคมศึกษาพื้นฐาน 3 (เศรษฐศาสตร์)', room: '1336,1336', teacher: 'อ.ฐิติรัตน์, อ.เบญจมาศ', day: 1, startTime: '13:20', endTime: '14:10', color: 'var(--color-amber)' },
            { id: 'b_mon_7', week: 'B', name: 'ลูกเสือ 2 / เนตรนารี', room: 'ห้องอาหารนักเรียน', teacher: 'คณะครู', day: 1, startTime: '14:10', endTime: '15:00', color: 'var(--color-amber)' },
            { id: 'b_tue_1', week: 'B', name: 'คณิตศาสตร์พื้นฐาน 3', room: '1336,1337', teacher: 'อ.สุนทรีย์, อ.อรทัย', day: 2, startTime: '08:00', endTime: '08:50', color: 'var(--color-purple)' },
            { id: 'b_tue_2', week: 'B', name: 'สังคมศึกษาพื้นฐาน 3 (พระพุทธ)', room: '1336', teacher: 'อ.ทรงพิสุทธิ์', day: 2, startTime: '08:50', endTime: '09:40', color: 'var(--color-amber)' },
            { id: 'b_tue_3', week: 'B', name: 'ทักษะการใช้ภาษาอังกฤษ 3', room: '1336', teacher: 'อ.เตชิต', day: 2, startTime: '09:50', endTime: '10:40', color: 'var(--color-blue)' },
            { id: 'b_tue_4', week: 'B', name: 'ทักษะการใช้ภาษาอังกฤษ 3', room: '1336', teacher: 'อ.เตชิต', day: 2, startTime: '10:40', endTime: '11:30', color: 'var(--color-blue)' },
            { id: 'b_tue_5', week: 'B', name: 'พลศึกษาพื้นฐาน 3', room: 'ข้างศาลาผกาภิรมย์', teacher: 'คณะครู', day: 2, startTime: '12:30', endTime: '13:20', color: 'var(--color-violet)' },
            { id: 'b_tue_6', week: 'B', name: 'การออกแบบและเทคโนโลยี 2', room: 'คอม 1-2', teacher: 'อ.ปริญญา, อ.สุรทัศน์', day: 2, startTime: '13:20', endTime: '14:10', color: 'var(--color-violet)' },
            { id: 'b_tue_7', week: 'B', name: 'การออกแบบและเทคโนโลยี 2', room: 'คอม 1-2', teacher: 'อ.ปริญญา, อ.สุรทัศน์', day: 2, startTime: '14:10', endTime: '15:00', color: 'var(--color-violet)' },
            { id: 'b_wed_1', week: 'B', name: 'ทักษะพื้นฐานอาชีพ 3', room: 'วิชาชีพ,วิชาชีพ,1336', teacher: 'อ.อาภรณ์, อ.ศุภดิศ, อ.วิณฑิศา', day: 3, startTime: '08:00', endTime: '08:50', color: 'var(--color-violet)' },
            { id: 'b_wed_2', week: 'B', name: 'ทักษะพื้นฐานอาชีพ 3', room: 'วิชาชีพ,วิชาชีพ,1336', teacher: 'อ.อาภรณ์, อ.ศุภดิศ, อ.วิณฑิศา', day: 3, startTime: '08:50', endTime: '09:40', color: 'var(--color-violet)' },
            { id: 'b_wed_3', week: 'B', name: 'วิทยาศาสตร์พื้นฐาน 3', room: 'Lab ชีวะ', teacher: 'อ.นันทิชา, อ.พุฒชฎากร', day: 3, startTime: '09:50', endTime: '10:40', color: 'var(--color-emerald)' },
            { id: 'b_wed_4', week: 'B', name: 'วิทยาศาสตร์พื้นฐาน 3', room: 'Lab ชีวะ', teacher: 'อ.นันทิชา, อ.พุฒชฎากร', day: 3, startTime: '10:40', endTime: '11:30', color: 'var(--color-emerald)' },
            { id: 'b_wed_5', week: 'B', name: 'ภาษาไทยพื้นฐาน 3', room: '1336', teacher: 'อ.คมสนัต์', day: 3, startTime: '12:30', endTime: '13:20', color: 'var(--color-rose)' },
            { id: 'b_wed_6', week: 'B', name: 'ภาษาจีนเบื้องต้น 3', room: '1343,1336,1343', teacher: 'อ.ธนิษฐา, อ.Jiaqi, อ.Shenglan', day: 3, startTime: '13:20', endTime: '14:10', color: 'var(--color-blue)' },
            { id: 'b_wed_7', week: 'B', name: 'ภาษาจีนเบื้องต้น 3', room: '1343,1336,1343', teacher: 'อ.ธนิษฐา, อ.Jiaqi, อ.Shenglan', day: 3, startTime: '14:10', endTime: '15:00', color: 'var(--color-blue)' },
            { id: 'b_thu_1', week: 'B', name: 'สุขศึกษาพื้นฐาน 3', room: '1336', teacher: 'อ.กิตติพงษ์', day: 4, startTime: '08:00', endTime: '08:50', color: 'var(--color-violet)' },
            { id: 'b_thu_2', week: 'B', name: 'คณิตศาสตร์พื้นฐาน 3', room: '1336,1334', teacher: 'อ.สุนทรีย์, อ.อรทัย', day: 4, startTime: '08:50', endTime: '09:40', color: 'var(--color-purple)' },
            { id: 'b_thu_3', week: 'B', name: 'ภาษาอังกฤษพื้นฐาน 3', room: '1338,1337,1335', teacher: 'คณะครู', day: 4, startTime: '09:50', endTime: '10:40', color: 'var(--color-blue)' },
            { id: 'b_thu_4', week: 'B', name: 'ภาษาอังกฤษพื้นฐาน 3', room: '1338,1337,1335', teacher: 'คณะครู', day: 4, startTime: '10:40', endTime: '11:30', color: 'var(--color-blue)' },
            { id: 'b_thu_5', week: 'B', name: 'สังคมศึกษาพื้นฐาน 3 (เศรษฐศาสตร์)', room: '1336,1336', teacher: 'อ.ฐิติรัตน์, อ.เบญจมาศ', day: 4, startTime: '12:30', endTime: '13:20', color: 'var(--color-amber)' },
            { id: 'b_thu_6', week: 'B', name: 'ชุมนุม', room: '', teacher: '', day: 4, startTime: '13:20', endTime: '14:10', color: 'var(--color-blue)' },
            { id: 'b_thu_7', week: 'B', name: 'ชุมนุม', room: '', teacher: '', day: 4, startTime: '14:10', endTime: '15:00', color: 'var(--color-blue)' },
            { id: 'b_fri_1', week: 'B', name: 'คณิตศาสตร์เสริม 3', room: '1336,1336', teacher: 'อ.สุนทรีย์, อ.อรทัย', day: 5, startTime: '08:00', endTime: '08:50', color: 'var(--color-purple)' },
            { id: 'b_fri_2', week: 'B', name: 'ประวัติศาสตร์ 3', room: '1336', teacher: 'อ.นนทพร', day: 5, startTime: '08:50', endTime: '09:40', color: 'var(--color-amber)' },
            { id: 'b_fri_3', week: 'B', name: 'ดนตรีนาฏศิลป์ไทย 3', room: 'ตึกศิลป์', teacher: 'คณะครู', day: 5, startTime: '09:50', endTime: '10:40', color: 'var(--color-rose)' },
            { id: 'b_fri_4', week: 'B', name: 'ดนตรีนาฏศิลป์ไทย 3', room: 'ตึกศิลป์', teacher: 'คณะครู', day: 5, startTime: '10:40', endTime: '11:30', color: 'var(--color-rose)' },
            { id: 'b_fri_5', week: 'B', name: 'ภาษาไทยพื้นฐาน 3', room: '1336', teacher: 'อ.คมสนัต์', day: 5, startTime: '12:30', endTime: '13:20', color: 'var(--color-rose)' },
            { id: 'b_fri_6', week: 'B', name: 'วิทยาศาสตร์เพิ่มเติม 3', room: 'โสตฯ', teacher: 'คณะครู', day: 5, startTime: '13:20', endTime: '14:10', color: 'var(--color-emerald)' },
            { id: 'b_fri_7', week: 'B', name: 'วิทยาศาสตร์เพิ่มเติม 3', room: 'โสตฯ', teacher: 'คณะครู', day: 5, startTime: '14:10', endTime: '15:00', color: 'var(--color-emerald)' },
            { id: 'b_fri_8', week: 'B', name: 'วิทยาศาสตร์เพิ่มเติม 3', room: 'โสตฯ', teacher: 'คณะครู', day: 5, startTime: '15:00', endTime: '15:50', color: 'var(--color-emerald)' },
        ];

        // Select timetable based on classroom
        if (classroom === 'ม.2/1') {
            this.state.timetable_A = JSON.parse(JSON.stringify(baseA_2_1));
            this.state.timetable_B = JSON.parse(JSON.stringify(baseB_2_1));
        } else if (classroom === 'ม.2/2') {
            this.state.timetable_A = JSON.parse(JSON.stringify(baseA_2_2));
            this.state.timetable_B = JSON.parse(JSON.stringify(baseB_2_2));
        } else {
            this.state.timetable_A = JSON.parse(JSON.stringify(baseA_2_3));
            this.state.timetable_B = JSON.parse(JSON.stringify(baseB_2_3));
        }

        // Ensure all mock timetable slots have valid UUIDs for Supabase compatibility
        this.state.timetable_A.forEach(slot => {
            if (!isValidUUID(slot.id)) slot.id = generateUUID();
        });
        this.state.timetable_B.forEach(slot => {
            if (!isValidUUID(slot.id)) slot.id = generateUUID();
        });

        // Mock Tasks
        this.state.tasks = [];
        
        if (!this.state.active_week) this.state.active_week = 'A';
        if (!this.state.viewing_week) this.state.viewing_week = 'A';
        
        this.saveState();
    }
    // ----------------------------------------------------
    // SETUP REFERENCES & BINDINGS
    // ----------------------------------------------------
    setupDOMReferences() {
        // Navigation items
        this.menuItems = document.querySelectorAll('.menu-item');
        this.viewsContainers = document.querySelectorAll('.content-view');
        // Header and Theme elements
        this.greetingTitle = document.getElementById('greeting-title');
        this.headerDate = document.getElementById('header-date');
        this.themeToggleBtn = document.getElementById('theme-toggle');
        this.sidebarActiveWeekBadge = document.getElementById('sidebar-active-week-badge');
        this.sidebarToggleWeekBtn = document.getElementById('sidebar-toggle-week-btn');
        this.sidebarAutoWeekCheckbox = document.getElementById('sidebar-auto-week-checkbox');
        this.headerWeekBanner = document.getElementById('header-week-banner');
                // Sidebar sync button
        this.sidebarSyncSheetBtn = document.getElementById('sidebar-sync-sheet-btn');
        // Timetable elements
        this.addClassBtn = document.getElementById('add-class-btn');
        this.timetableGridRoot = document.getElementById('timetable-grid-root');
        this.tabWeekA = document.getElementById('tab-week-A');
        this.tabWeekB = document.getElementById('tab-week-B');
        this.timetableWeekViewingStatus = document.getElementById('timetable-week-viewing-status');
        this.setCurrentWeekActiveBtn = document.getElementById('set-current-week-active-btn');
        this.resetDefaultTimetableBtn = document.getElementById('reset-default-timetable-btn');
        // Tasks elements
        this.addTaskBtn = document.getElementById('add-task-btn');
        this.tasksListRoot = document.getElementById('tasks-list-root');
        this.taskSortSelect = document.getElementById('task-sort-select');
        this.taskFilterBtns = document.querySelectorAll('.filter-btn');
        this.countAllTasks = document.getElementById('count-all-tasks');
        this.countPendingTasks = document.getElementById('count-pending-tasks');
        this.countCompletedTasks = document.getElementById('count-completed-tasks');
        // Pomodoro Elements
        this.timerTime = document.getElementById('timer-time');
        this.timerStatus = document.getElementById('timer-status');
        this.timerPlayPauseBtn = document.getElementById('timer-play-pause-btn');
        this.timerResetBtn = document.getElementById('timer-reset-btn');
        this.timerProgressCircle = document.getElementById('timer-progress-circle');
        this.pomodoroModes = document.querySelectorAll('.mode-btn');
        this.pomodoroSessionCount = document.getElementById('pomodoro-session-count');
        this.pomodoroFocusMinutes = document.getElementById('pomodoro-focus-minutes');
        
        // Mini focus on dashboard
        this.miniTimerTime = document.getElementById('mini-timer-time');
        this.miniTimerPlayBtn = document.getElementById('mini-timer-play-btn');
        this.miniTimerResetBtn = document.getElementById('mini-timer-reset-btn');
        // Sound Elements
        this.ambientVolumeSlider = document.getElementById('ambient-volume');
        // Modals
        this.classModal = document.getElementById('class-modal');
        this.classForm = document.getElementById('class-form');
        this.classModalClose = document.getElementById('class-modal-close');
        this.classModalCancel = document.getElementById('class-modal-cancel');
        this.classModalTitle = document.getElementById('class-modal-title');
        
        this.taskModal = document.getElementById('task-modal');
        this.taskForm = document.getElementById('task-form');
        this.taskModalClose = document.getElementById('task-modal-close');
        this.taskModalCancel = document.getElementById('task-modal-cancel');
        this.taskModalTitle = document.getElementById('task-modal-title');
        // Mobile Sidebar elements
        this.sidebarToggleBtn = document.getElementById('sidebar-toggle');
        this.sidebarCloseBtn = document.getElementById('sidebar-close');
        this.sidebarOverlay = document.getElementById('sidebar-overlay');
        this.sidebar = document.querySelector('.sidebar');
        // Google Sheets Sync Settings elements
        this.syncSettingsToggle = document.getElementById('sync-settings-toggle');
        this.syncSettingsBody = document.getElementById('sync-settings-body');
        this.syncHeaderIcon = document.getElementById('sync-header-icon');
        this.syncToggleChevron = document.getElementById('sync-toggle-chevron');
        this.syncStatusBadge = document.getElementById('sync-status-badge');
        this.syncAppScriptUrl = document.getElementById('sync-app-script-url');
        this.saveSyncUrlBtn = document.getElementById('save-sync-url-btn');
        this.clearSyncUrlBtn = document.getElementById('clear-sync-url-btn');
        this.manualSyncBtn = document.getElementById('manual-sync-btn');
        this.manualSyncIcon = document.getElementById('manual-sync-icon');
        this.syncQueueCount = document.getElementById('sync-queue-count');
        this.openSyncGuideBtn = document.getElementById('open-sync-guide-btn');
        this.syncGuideModal = document.getElementById('sync-guide-modal');
        this.syncGuideModalClose = document.getElementById('sync-guide-modal-close');
        this.syncGuideModalOk = document.getElementById('sync-guide-modal-ok');
        
        // Admin Management elements
        this.adminRefreshBtn = document.getElementById('admin-refresh-btn');
        this.adminSearchStudent = document.getElementById('admin-search-student');
        this.adminStudentCount = document.getElementById('admin-student-count');
        this.adminStudentListContainer = document.getElementById('admin-student-list-container');
    }
    setupEventListeners() {
        // Tab switching
        this.menuItems.forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                const view = item.getAttribute('data-view');
                this.switchView(view);
                
                // Close sidebar on mobile when navigating
                if (window.innerWidth <= 768) {
                    this.closeMobileSidebar();
                }
            });
        });
        // Mobile Sidebar Events
        if (this.sidebarToggleBtn) {
            this.sidebarToggleBtn.addEventListener('click', () => {
                this.openMobileSidebar();
            });
        }
        if (this.sidebarCloseBtn) {
            this.sidebarCloseBtn.addEventListener('click', () => {
                this.closeMobileSidebar();
            });
        }
        if (this.sidebarOverlay) {
            this.sidebarOverlay.addEventListener('click', () => {
                this.closeMobileSidebar();
            });
        }
        // Theme toggling
        this.themeToggleBtn.addEventListener('click', () => {
            this.state.theme = this.state.theme === 'dark' ? 'light' : 'dark';
            this.applyTheme();
            this.saveState();
        });
        // Sidebar week toggle shortcut
        this.sidebarToggleWeekBtn.addEventListener('click', () => {
            this.toggleActiveWeek();
        });
        if (this.sidebarAutoWeekCheckbox) {
            this.sidebarAutoWeekCheckbox.addEventListener('change', (e) => {
                this.state.auto_week_switch = e.target.checked;
                this.saveState();
                console.log(`[Auto Week Switch] Changed auto switch setting to: ${this.state.auto_week_switch}`);
            });
        }
        // Current week action button on timetable
        this.setCurrentWeekActiveBtn.addEventListener('click', () => {
            this.state.active_week = this.state.viewing_week;
            const currentMondayStr = this.getMondayStr(new Date());
            this.state.last_week_monday = currentMondayStr;
            this.saveState();
            this.renderAll();
        });
        if (this.resetDefaultTimetableBtn) {
            this.resetDefaultTimetableBtn.addEventListener('click', () => {
                this.resetToChitraladaTimetable();
            });
        }
        // Modals opening
        this.addClassBtn.addEventListener('click', () => this.openClassModal());
        this.addTaskBtn.addEventListener('click', () => this.openTaskModal());
        // Modals closing
        this.classModalClose.addEventListener('click', () => this.closeClassModal());
        this.classModalCancel.addEventListener('click', () => this.closeClassModal());
        this.taskModalClose.addEventListener('click', () => this.closeTaskModal());
        this.taskModalCancel.addEventListener('click', () => this.closeTaskModal());
        // Modal submit
        this.classForm.addEventListener('submit', (e) => this.handleClassSubmit(e));
        this.taskForm.addEventListener('submit', (e) => this.handleTaskSubmit(e));
        // Task sorting & filtering
        this.taskSortSelect.addEventListener('change', () => this.renderTasks());
        this.taskFilterBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                this.taskFilterBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.renderTasks();
            });
        });
        // Pomodoro Modes
        this.pomodoroModes.forEach(btn => {
            btn.addEventListener('click', () => {
                this.pomodoroModes.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                
                const duration = parseInt(btn.getAttribute('data-duration'));
                const mode = btn.getAttribute('data-mode');
                
                this.setPomodoroMode(mode, duration);
            });
        });
        // Pomodoro Actions
        this.timerPlayPauseBtn.addEventListener('click', () => this.togglePomodoro());
        this.timerResetBtn.addEventListener('click', () => this.resetPomodoro());
        
        // Mini focus triggers
        this.miniTimerPlayBtn.addEventListener('click', () => this.togglePomodoro());
        this.miniTimerResetBtn.addEventListener('click', () => this.resetPomodoro());
        // Ambient Sound Controls
        this.ambientVolumeSlider.addEventListener('input', (e) => {
            this.volume = parseFloat(e.target.value) / 100;
            this.updateVolume();
        });
        if (this.sidebarSyncSheetBtn) {
            this.sidebarSyncSheetBtn.addEventListener('click', () => {
                if (this.state.settings && this.state.settings.googleScriptUrl) {
                    this.syncWithSheet(true);
                } else {
                    this.loadTasksFromSheet();
                }
            });
        }
        // Google Sheets Sync Settings Event Listeners
        if (this.syncSettingsToggle) {
            this.syncSettingsToggle.addEventListener('click', () => {
                const isOpen = this.syncSettingsBody.style.display === 'block';
                this.syncSettingsBody.style.display = isOpen ? 'none' : 'block';
                if (this.syncToggleChevron) {
                    this.syncToggleChevron.classList.toggle('rotated', !isOpen);
                }
            });
        }
        if (this.saveSyncUrlBtn) {
            this.saveSyncUrlBtn.addEventListener('click', () => {
                const url = this.syncAppScriptUrl.value.trim();
                if (!url) {
                    alert("กรุณากรอก Google Apps Script Web App URL");
                    return;
                }
                if (!url.startsWith("https://script.google.com/macros/")) {
                    return;
                }
                this.state.settings.googleScriptUrl = url;
                this.saveState();
                this.syncWithSheet(true);
            });
        }
        if (this.clearSyncUrlBtn) {
            this.clearSyncUrlBtn.addEventListener('click', () => {
                this.state.settings.googleScriptUrl = "";
                this.saveState();
                this.updateSyncUI();
                alert("ยกเลิกการเชื่อมต่อเรียบร้อยแล้ว");
            });
        }
        if (this.manualSyncBtn) {
            this.manualSyncBtn.addEventListener('click', () => {
                if (!this.state.settings.googleScriptUrl) {
                    return;
                }
                this.syncWithSheet(true);
            });
        }
        if (this.openSyncGuideBtn) {
            this.openSyncGuideBtn.addEventListener('click', (e) => {
                e.preventDefault();
                if (this.syncGuideModal) {
                    this.syncGuideModal.classList.add('active');
                }
            });
        }
        if (this.syncGuideModalClose) {
            this.syncGuideModalClose.addEventListener('click', () => {
                this.syncGuideModal.classList.remove('active');
            });
        }
        if (this.syncGuideModalOk) {
            this.syncGuideModalOk.addEventListener('click', () => {
                this.syncGuideModal.classList.remove('active');
            });
        }
        
        if (this.adminRefreshBtn) {
            this.adminRefreshBtn.addEventListener('click', () => {
                if (this.currentView === 'admin' && typeof this.fetchAndRenderAdminStudents === 'function') {
                    this.fetchAndRenderAdminStudents();
                }
            });
        }
        
        // Class Details Modal close handlers
        const classDetailsModalClose = document.getElementById('class-details-modal-close');
        const classDetailsCloseBtn = document.getElementById('class-details-close-btn');
        if (classDetailsModalClose) {
            classDetailsModalClose.addEventListener('click', () => this.closeClassDetailsModal());
        }
        if (classDetailsCloseBtn) {
            classDetailsCloseBtn.addEventListener('click', () => this.closeClassDetailsModal());
        }
    }
    // ----------------------------------------------------
    // NAVIGATION & LAYOUT RENDERERS
    // ----------------------------------------------------
    switchView(viewName) {
        if (!this.views.includes(viewName)) return;
        
        // Prevent guests from accessing tasks view
        const isGuest = this.state.profile && this.state.profile.isGuest;
        if (isGuest && viewName === 'tasks') {
            viewName = 'dashboard';
        }
        
        this.currentView = viewName;
        // Nav active class
        this.menuItems.forEach(item => {
            if (item.getAttribute('data-view') === viewName) {
                item.classList.add('active');
            } else {
                item.classList.remove('active');
            }
        });
        // Containers toggle
        this.viewsContainers.forEach(container => {
            if (container.getAttribute('id') === `view-${viewName}`) {
                container.classList.add('active');
            } else {
                container.classList.remove('active');
            }
        });
        // Specific view renders when navigated
        if (viewName === 'dashboard') {
            this.renderDashboard();
        } else if (viewName === 'timetable') {
            this.renderTimetable();
        } else if (viewName === 'tasks') {
            this.renderTasks();
        } else if (viewName === 'pomodoro') {
            this.renderPomodoro();
        } else if (viewName === 'analytics') {
            this.renderAnalytics();
        } else if (viewName === 'admin') {
            this.renderAdmin();
        }
    }
    applyTheme() {
        document.documentElement.setAttribute('data-theme', this.state.theme);
        const icon = this.themeToggleBtn.querySelector('i');
        if (this.state.theme === 'light') {
            icon.className = 'fa-solid fa-sun';
            this.themeToggleBtn.setAttribute('title', 'สลับเป็นธีมมืด');
        } else {
            icon.className = 'fa-solid fa-moon';
            this.themeToggleBtn.setAttribute('title', 'สลับเป็นธีมสว่าง');
        }
    }
    openMobileSidebar() {
        if (this.sidebar) this.sidebar.classList.add('active');
        if (this.sidebarOverlay) this.sidebarOverlay.classList.add('active');
    }
    closeMobileSidebar() {
        if (this.sidebar) this.sidebar.classList.remove('active');
        if (this.sidebarOverlay) this.sidebarOverlay.classList.remove('active');
    }
    toggleActiveWeek() {
        this.state.active_week = this.state.active_week === 'A' ? 'B' : 'A';
        const currentMondayStr = this.getMondayStr(new Date());
        this.state.last_week_monday = currentMondayStr;
        this.saveState();
        this.renderAll();
    }
    getMondayStr(d) {
        const date = new Date(d);
        const day = date.getDay();
        const diff = date.getDate() - day + (day === 0 ? -6 : 1);
        const monday = new Date(date.setDate(diff));
        return monday.toISOString().split('T')[0];
    }
    checkAutoWeekSwitch() {
        if (!this.state.auto_week_switch) return;
        
        // Epoch Date: วันจันทร์ที่ 6 กรกฎาคม 2026 เป็น "สัปดาห์ A"
        const epochMondayStr = "2026-07-06";
        const currentMondayStr = this.getMondayStr(new Date());
        
        const msPerWeek = 7 * 24 * 60 * 60 * 1000;
        const diffMs = new Date(currentMondayStr) - new Date(epochMondayStr);
        
        const diffWeeks = Math.round(diffMs / msPerWeek);
        
        if (diffWeeks >= 0) {
            // ถ้าผ่านไปเป็นจำนวนเลขคู่ (0, 2, 4...) = สัปดาห์ A
            // ถ้าผ่านไปเป็นจำนวนเลขคี่ (1, 3, 5...) = สัปดาห์ B
            const calculatedWeek = (diffWeeks % 2 === 0) ? 'A' : 'B';
            
            if (this.state.active_week !== calculatedWeek) {
                this.state.active_week = calculatedWeek;
                this.state.viewing_week = calculatedWeek;
                this.saveState();
            }
        }
    }
    resetToChitraladaTimetable() {
        this.loadMockData();
        this.renderAll();
    }
    updateHeaderGreeting() {
        const now = new Date();
        const hour = now.getHours();
        
        let timeOfDayLabel = 'ยินดีต้อนรับ';
        let emoji = '🎒';
        
        if (hour >= 5 && hour < 12) {
            timeOfDayLabel = 'ตอนเช้า';
            emoji = '🌅';
        } else if (hour >= 12 && hour < 17) {
            timeOfDayLabel = 'ตอนบ่าย';
            emoji = '☀️';
        } else if (hour >= 17 && hour < 22) {
            timeOfDayLabel = 'ตอนเย็น';
            emoji = '🌇';
        } else {
            timeOfDayLabel = 'ตอนค่ำ';
            emoji = '🌙';
        }
        
        const nickname = this.state.profile ? this.state.profile.nickname : 'นักเรียน';
        const classroom = this.state.profile ? this.state.profile.classroom : 'ม.2/3';
        const isGuest = this.state.profile && this.state.profile.isGuest;
        
        let greeting = `สวัสดี${timeOfDayLabel} ยินดีต้อนรับสู่ระบบวางแผนการเรียน ${classroom} ${nickname}! ${emoji}`;
        if (isGuest) {
            greeting = `สวัสดี${timeOfDayLabel} คุณกำลังเยี่ยมชมตารางเรียนชั้น ${classroom} (โหมดอ่านอย่างเดียว)! ${emoji}`;
        }
        if (nickname.toLowerCase() === 'goragod') {
            greeting = `สวัสดีคุณครู${timeOfDayLabel} ${nickname}! ยินดีต้อนรับสู่ระบบแดชบอร์ดจัดการนักเรียน! 👑`;
        }
        if (this.greetingTitle) this.greetingTitle.textContent = greeting;
        
        // Render full date and current active week
        const options = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' };
        const thaiDate = now.toLocaleDateString('th-TH', options);
        
        if (this.headerDate) {
            this.headerDate.innerHTML = `${thaiDate} | สัปดาห์ปัจจุบัน: <strong class="text-accent-${this.state.active_week}">ตาราง ${this.state.active_week}</strong>`;
        }
    }
    renderAll() {
        // Badges update
        const activeText = `ตาราง ${this.state.active_week}`;
        if (this.sidebarActiveWeekBadge) {
            this.sidebarActiveWeekBadge.textContent = activeText;
            this.sidebarActiveWeekBadge.className = `active-week-badge text-accent-${this.state.active_week}`;
        }
        
        if (this.sidebarAutoWeekCheckbox) {
            this.sidebarAutoWeekCheckbox.checked = this.state.auto_week_switch;
        }
        
        if (this.headerWeekBanner) {
            this.headerWeekBanner.innerHTML = `<span class="pulse-indicator"></span><span>ขณะนี้ใช้งาน: <strong class="text-accent-${this.state.active_week}">ตาราง ${this.state.active_week}</strong></span>`;
        }
        // Guest mode UI updates
        const isGuest = this.state.profile && this.state.profile.isGuest;
        
        // 1. Hide Tasks sidebar tab
        const navTasks = document.getElementById('nav-tasks');
        if (navTasks) {
            navTasks.style.display = isGuest ? 'none' : 'inline-flex';
        }
        
        // 2. Hide Timetable editing buttons
        const addClassBtn = document.getElementById('add-class-btn');
        if (addClassBtn) {
            addClassBtn.style.display = isGuest ? 'none' : 'inline-flex';
        }
        const resetDefaultTimetableBtn = document.getElementById('reset-default-timetable-btn');
        if (resetDefaultTimetableBtn) {
            resetDefaultTimetableBtn.style.display = isGuest ? 'none' : 'inline-flex';
        }

        // Call active view render
        this.switchView(this.currentView);
    }
    // ----------------------------------------------------
    // DASHBOARD VIEW
    // ----------------------------------------------------
    renderDashboard() {
        this.updateHeaderGreeting();
        
        const now = new Date();
        // JavaScript day is 0 (Sunday) to 6 (Saturday). Monday is 1, Sunday is 0.
        const currentJSIndex = now.getDay(); 
        
        // Load classes of active week
        const currentTimetable = this.state.active_week === 'A' ? this.state.timetable_A : this.state.timetable_B;
        
        // Filter classes for today
        const todayClasses = currentTimetable.filter(slot => parseInt(slot.day) === currentJSIndex)
                                              .sort((a, b) => a.startTime.localeCompare(b.startTime));
        
        const isGuest = this.state.profile && this.state.profile.isGuest;
        
        // Hide/show mini tasks card on dashboard
        const miniTasksCard = document.querySelector('.mini-tasks-card');
        if (miniTasksCard) {
            miniTasksCard.style.display = isGuest ? 'none' : 'block';
        }
        
        // Adjust hero card paragraph
        const heroContentP = document.querySelector('.hero-content p');
        if (heroContentP) {
            if (isGuest) {
                heroContentP.innerHTML = `วันนี้ห้อง ${this.state.profile.classroom} มีเรียนทั้งหมด <span id="dash-class-count">${todayClasses.length}</span> วิชา มาร่วมเรียนรู้ไปด้วยกันนะ!`;
            } else {
                const pendingTasks = this.state.tasks.filter(t => !t.completed).length;
                heroContentP.innerHTML = `วันนี้คุณมีเรียนทั้งหมด <span id="dash-class-count">${todayClasses.length}</span> วิชา และงานที่ค้างอยู่ <span id="dash-task-count">${pendingTasks}</span> งาน มาพยายามไปด้วยกันนะ!`;
            }
        }

        // Set counts
        document.getElementById('dash-class-count').textContent = todayClasses.length;
        if (document.getElementById('dash-task-count')) {
            const pendingTasks = this.state.tasks.filter(t => !t.completed).length;
            document.getElementById('dash-task-count').textContent = pendingTasks;
        }
        document.getElementById('dash-today-schedule-label').textContent = `ตาราง ${this.state.active_week}`;
        // Render today classes list
        const todayClassesContainer = document.getElementById('today-classes-container');
        todayClassesContainer.innerHTML = '';
        if (todayClasses.length === 0) {
            todayClassesContainer.innerHTML = `
                <div class="empty-state">
                    <i class="fa-solid fa-mug-hot"></i>
                </div>`;
        } else {
            todayClasses.forEach(slot => {
                const item = document.createElement('div');
                item.className = 'today-class-item';
                item.style.setProperty('--class-color', slot.color);
                item.innerHTML = `
                    <div class="class-time-badge">
                        <i class="fa-regular fa-clock"></i> ${slot.startTime} - ${slot.endTime}
                    </div>
                    <div class="class-details">
                        <h4>${slot.name}</h4>
                        <div class="class-meta-row">
                            ${slot.teacher ? `<span title="ครูผู้สอน: ${slot.teacher}"><i class="fa-solid fa-user-tie"></i> ${slot.teacher}</span>` : ''}
                            ${slot.room ? `<span title="ห้องเรียน: ${slot.room}"><i class="fa-solid fa-location-dot"></i> ${slot.room}</span>` : ''}
                        </div>
                    </div>
                `;
                todayClassesContainer.appendChild(item);
            });
        }
        // Render mini tasks list (top 3 highest priority pending)
        const miniTasksContainer = document.getElementById('mini-tasks-container');
        miniTasksContainer.innerHTML = '';
        
        const urgentTasks = this.state.tasks
            .filter(t => !t.completed)
            .sort((a, b) => {
                const priorityWeight = { high: 3, medium: 2, low: 1 };
                if (priorityWeight[b.priority] !== priorityWeight[a.priority]) {
                    return priorityWeight[b.priority] - priorityWeight[a.priority];
                }
                return new Date(a.dueDate) - new Date(b.dueDate);
            })
            .slice(0, 3);
        if (urgentTasks.length === 0) {
            miniTasksContainer.innerHTML = `
                <div class="empty-state" style="padding: 1rem;">
                    <i class="fa-solid fa-clipboard-check" style="font-size: 1.5rem;"></i>
                </div>`;
        } else {
            urgentTasks.forEach(task => {
                const item = document.createElement('div');
                item.className = `mini-task-item ${task.completed ? 'completed' : ''}`;
                item.innerHTML = `
                    <div class="mini-task-left">
                        <div class="task-checkbox-round" onclick="app.toggleTaskCompletion('${task.id}')">
                            <i class="fa-solid fa-check"></i>
                        </div>
                        <span class="task-title-text">${task.title}</span>
                    </div>
                `;
                miniTasksContainer.appendChild(item);
            });
        }
        // Render mini analytics SVG
        this.renderMiniChart();
    }
    // ----------------------------------------------------
    // TIMETABLE VIEW
    // ----------------------------------------------------
    setTimetableViewWeek(week) {
        this.state.viewing_week = week;
        this.saveState();
        this.renderTimetable();
    }
    renderTimetable() {
        const viewingWeek = this.state.viewing_week;
        const currentTimetable = viewingWeek === 'A' ? this.state.timetable_A : this.state.timetable_B;
        
        // Update viewing status text dynamically
        if (this.timetableWeekViewingStatus) {
            this.timetableWeekViewingStatus.innerHTML = `คุณกำลังดู: <strong class="text-accent-${viewingWeek}">ตาราง ${viewingWeek}</strong>`;
        }
        
        // Toggle active tabs visually
        if (viewingWeek === 'A') {
            this.tabWeekA.classList.add('active');
            this.tabWeekB.classList.remove('active');
        } else {
            this.tabWeekA.classList.remove('active');
            this.tabWeekB.classList.add('active');
        }
        // Toggle current week active button visibility
        if (this.state.active_week === viewingWeek) {
            this.setCurrentWeekActiveBtn.style.display = 'none';
        } else {
            this.setCurrentWeekActiveBtn.style.display = 'inline-flex';
        }
        // Build Table Frame
        this.timetableGridRoot.innerHTML = '';
        // Day Column Labels: Mon=1, Tue=2, Wed=3, Thu=4, Fri=5.
        // We will order them: Mon, Tue, Wed, Thu, Fri.
        const daysOrder = [1, 2, 3, 4, 5];
        // 1. Column header top left corner empty block
        const emptyCorner = document.createElement('div');
        emptyCorner.className = 'day-header empty-header';
        this.timetableGridRoot.appendChild(emptyCorner);
        // 2. Day Headers (Mon - Sun)
        const todayJSIdx = new Date().getDay();
        const dayNames = ['วันอาทิตย์', 'วันจันทร์', 'วันอังคาร', 'วันพุธ', 'วันพฤหัสบดี', 'วันศุกร์', 'วันเสาร์'];
        daysOrder.forEach(dayIndex => {
            const dayEl = document.createElement('div');
            dayEl.className = 'day-header';
            if (this.state.active_week === viewingWeek && dayIndex === todayJSIdx) {
                dayEl.classList.add('active-day');
            }
            dayEl.textContent = dayNames[dayIndex].replace('วัน', '');
            this.timetableGridRoot.appendChild(dayEl);
        });
        // 3. Time axis (Left column) and Canvas layout
        const timeAxis = document.createElement('div');
        timeAxis.className = 'time-axis';
        this.timetableGridRoot.appendChild(timeAxis);
        // 4. Timetable main canvas container
        const canvas = document.createElement('div');
        canvas.className = 'timetable-canvas';
        this.timetableGridRoot.appendChild(canvas);
        // Render grid lines & hours
        const gridLines = document.createElement('div');
        gridLines.className = 'grid-lines-container';
        canvas.appendChild(gridLines);
        for (let hour = this.gridStartHour; hour <= this.gridEndHour; hour++) {
            const pct = ((hour - this.gridStartHour) / (this.gridEndHour - this.gridStartHour)) * 100;
            
            // Draw axis labels
            const marker = document.createElement('div');
            marker.className = 'time-marker';
            marker.style.top = `${pct}%`;
            marker.textContent = `${String(hour).padStart(2, '0')}:00`;
            timeAxis.appendChild(marker);
            // Draw line
            if (hour > this.gridStartHour && hour < this.gridEndHour) {
                const line = document.createElement('div');
                line.className = 'grid-line';
                line.style.top = `${pct}%`;
                gridLines.appendChild(line);
            }
        }
        // Render classes slots cards
        if (currentTimetable.length === 0) {
            const emptyOverlay = document.createElement('div');
            emptyOverlay.className = 'empty-state';
            emptyOverlay.innerHTML = `
                <div>
                    <i class="fa-solid fa-calendar-xmark" style="font-size: 3rem; opacity:0.3; margin-bottom:1rem;"></i>
                </div>
            `;
            canvas.appendChild(emptyOverlay);
        } else {
            currentTimetable.forEach(slot => {
                // Determine day index coordinate (0=Mon, 1=Tue, 2=Wed, etc.)
                const dayCoord = daysOrder.indexOf(parseInt(slot.day));
                if (dayCoord === -1) return; // invalid day value
                // Parse time to coordinates
                const [startHour, startMin] = slot.startTime.split(':').map(Number);
                const [endHour, endMin] = slot.endTime.split(':').map(Number);
                
                const startMinsTotal = startHour * 60 + startMin;
                const endMinsTotal = endHour * 60 + endMin;
                const gridStartMins = this.gridStartHour * 60;
                
                const slotTopPct = ((startMinsTotal - gridStartMins) / this.totalMinutes) * 100;
                const slotDuration = endMinsTotal - startMinsTotal;
                const slotHeightPct = (slotDuration / this.totalMinutes) * 100;
                // Border and offsets for gorgeous card gaps
                const leftPosPct = (dayCoord / daysOrder.length) * 100;
                const widthPct = (1 / daysOrder.length) * 100;
                const card = document.createElement('div');
                card.className = 'class-slot-card';
                card.style.top = `calc(${slotTopPct}% + 4px)`;
                card.style.height = `calc(${slotHeightPct}% - 8px)`;
                card.style.left = `calc(${leftPosPct}% + 3px)`;
                card.style.width = `calc(${widthPct}% - 6px)`;
                card.style.borderLeft = `5px solid ${slot.color}`;
                card.style.setProperty('--class-color', slot.color);
                
                // Override flex layout and tight padding to ensure Subject Name is always at the top and visible
                card.style.display = 'block';
                card.style.padding = '4px 6px';
                
                const isGuest = this.state.profile && this.state.profile.isGuest;
                
                card.innerHTML = `
                    <div class="slot-name" title="${slot.name}" style="font-weight: 800; font-size: 0.72rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-bottom: 2px;">${slot.name}</div>
                    <div class="slot-details" style="font-size: 0.58rem; opacity: 0.9; display: flex; flex-direction: column; gap: 1px; line-height: 1.2;">
                        ${slot.teacher ? `<div class="slot-teacher" title="${slot.teacher}" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: flex; align-items: center; gap: 2px;"><i class="fa-solid fa-user-tie" style="font-size: 0.5rem; width: 8px;"></i> ${slot.teacher}</div>` : ''}
                        ${slot.room ? `
                        <div class="slot-room" title="${slot.room}" style="margin-top: 0 !important; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: flex; align-items: center; gap: 2px;">
                            <i class="fa-solid fa-location-dot" style="font-size: 0.5rem; width: 8px;"></i> ${slot.room}
                        </div>
                        ` : ''}
                        <div class="slot-time" style="font-size: 0.55rem; font-weight: 600; display: flex; align-items: center; gap: 2px;">
                            <i class="fa-solid fa-clock" style="font-size: 0.5rem; width: 8px;"></i> ${slot.startTime} - ${slot.endTime}
                        </div>
                    </div>
                    ${isGuest ? '' : `
                    <div class="slot-actions">
                        <button class="slot-act-btn edit-btn" title="แก้ไขวิชา">
                            <i class="fa-solid fa-edit"></i>
                        </button>
                        <button class="slot-act-btn delete-btn" title="ลบวิชา">
                            <i class="fa-solid fa-trash-can"></i>
                        </button>
                    </div>
                    `}
                `;
                
                // Add event listeners for edit and delete actions
                const editBtn = card.querySelector('.edit-btn');
                const deleteBtn = card.querySelector('.delete-btn');
                if (editBtn) {
                    editBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        this.openClassModal(slot.id);
                    });
                }
                if (deleteBtn) {
                    deleteBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        if (confirm(`ต้องการลบวิชา ${slot.name} ใช่หรือไม่?`)) {
                            this.deleteClass(slot.id);
                        }
                    });
                }
                
                card.addEventListener('click', (e) => {
                    this.openClassDetailsModal(slot);
                });
                // Quick double-click action to edit
                if (!isGuest) {
                    card.addEventListener('dblclick', () => this.openClassModal(slot.id));
                }
                canvas.appendChild(card);
            });
        }
    }
    // ----------------------------------------------------
    // TIMETABLE DIALOG CRUD
    // ----------------------------------------------------
    openClassModal(classId = null) {
        if (this.state.profile && this.state.profile.isGuest) {
            return;
        }
        this.classForm.reset();
        
        // Set Default viewing week in form
        if (this.state.viewing_week === 'A') {
            document.getElementById('class-week-A').checked = true;
        } else {
            document.getElementById('class-week-B').checked = true;
        }
        if (classId) {
            // EDIT MODE
            this.classModalTitle.textContent = "แก้ไขวิชาเรียน";
            document.getElementById('class-save-btn').textContent = "อัปเดตวิชาเรียน";
            
            const currentTimetable = this.state.viewing_week === 'A' ? this.state.timetable_A : this.state.timetable_B;
            const slot = currentTimetable.find(c => c.id === classId);
            
            if (slot) {
                document.getElementById('edit-class-id').value = slot.id;
                
                if (slot.week === 'A') {
                    document.getElementById('class-week-A').checked = true;
                } else {
                    document.getElementById('class-week-B').checked = true;
                }
                document.getElementById('class-name').value = slot.name;
                document.getElementById('class-room').value = slot.room || '';
                document.getElementById('class-teacher').value = slot.teacher || '';
                document.getElementById('class-day').value = slot.day;
                document.getElementById('class-start-time').value = slot.startTime;
                document.getElementById('class-end-time').value = slot.endTime;
                // Pick color
                const colorRadios = this.classForm.querySelectorAll('input[name="class-color"]');
                colorRadios.forEach(radio => {
                    if (radio.value === slot.color) {
                        radio.checked = true;
                    }
                });
            }
        } else {
            // ADD MODE
            this.classModalTitle.textContent = "เพิ่มวิชาเรียนใหม่";
            document.getElementById('class-save-btn').textContent = "บันทึกวิชาเรียน";
            document.getElementById('edit-class-id').value = "";
            
            // Set standard hour ranges based on current time or reasonable defaults
            document.getElementById('class-start-time').value = "08:30";
            document.getElementById('class-end-time').value = "10:10";
        }
        this.classModal.classList.add('active');
    }
    closeClassModal() {
        this.classModal.classList.remove('active');
        this.classForm.reset();
    }
    handleClassSubmit(e) {
        e.preventDefault();
        
        const id = document.getElementById('edit-class-id').value;
        const week = this.classForm.querySelector('input[name="class-week"]:checked').value;
        const name = document.getElementById('class-name').value.trim();
        const room = document.getElementById('class-room').value.trim();
        const teacher = document.getElementById('class-teacher').value.trim();
        const day = parseInt(document.getElementById('class-day').value);
        const startTime = document.getElementById('class-start-time').value;
        const endTime = document.getElementById('class-end-time').value;
        const color = this.classForm.querySelector('input[name="class-color"]:checked').value;
        // Validations
        if (!name || startTime === "" || endTime === "") {
            return;
        }
        if (startTime >= endTime) {
            return;
        }
        const startHour = parseInt(startTime.split(':')[0]);
        const endHour = parseInt(endTime.split(':')[0]);
        if (startHour < this.gridStartHour || endHour > this.gridEndHour) {
            return;
        }
        const classObject = {
            id: id || generateUUID(),
            week, name, room, teacher, day, startTime, endTime, color
        };
        if (id) {
            // Edit: remove from old list and add to correct week list (since week toggle is editable)
            this.state.timetable_A = this.state.timetable_A.filter(c => c.id !== id);
            this.state.timetable_B = this.state.timetable_B.filter(c => c.id !== id);
        }
        // Insert into correct week array
        if (week === 'A') {
            this.state.timetable_A.push(classObject);
        } else {
            this.state.timetable_B.push(classObject);
        }
        
        // Sync with Supabase in real-time if configured and profile is logged in
        if (supabaseClient && this.state.profile) {
            const profileUUID = this.state.profile.id;
            if (profileUUID) {
                supabaseClient.from('timetables').upsert({
                    id: classObject.id,
                    profile_id: profileUUID,
                    week: classObject.week,
                    name: classObject.name,
                    room: classObject.room || "",
                    teacher: classObject.teacher || "",
                    day: classObject.day,
                    starttime: classObject.startTime,
                    endtime: classObject.endTime,
                    color: classObject.color || ""
                }).then(({ error }) => {
                    if (error) console.error("Error syncing class to Supabase:", error);
                    else console.log("Class slot synced successfully to Supabase!");
                });
            }
        }
        
        // Force viewers to switch if they saved to a week that is not viewing
        this.state.viewing_week = week;
        this.saveState();
        this.closeClassModal();
        this.renderAll();
    }
    deleteClass(classId) {
        this.state.timetable_A = this.state.timetable_A.filter(c => c.id !== classId);
        this.state.timetable_B = this.state.timetable_B.filter(c => c.id !== classId);
        this.saveState();
        
        // Sync with Supabase in real-time if configured and profile is logged in
        if (supabaseClient && this.state.profile) {
            supabaseClient.from('timetables')
                .delete()
                .eq('id', classId)
                .then(({ error }) => {
                    if (error) console.error("Error deleting class from Supabase:", error);
                    else console.log("Class slot deleted successfully from Supabase!");
                });
        }
        
        this.renderAll();
    }
    // ----------------------------------------------------
    // TASKS & ASSIGNMENTS VIEW
    // ----------------------------------------------------
    renderTasks() {
        this.updateSyncUI();
        const filter = document.querySelector('.filter-btn.active').getAttribute('data-filter');
        const sortBy = this.taskSortSelect.value;
        // Apply filters
        let filteredTasks = [...this.state.tasks];
        
        if (filter === 'pending') {
            filteredTasks = filteredTasks.filter(t => !t.completed);
        } else if (filter === 'completed') {
            filteredTasks = filteredTasks.filter(t => t.completed);
        }
        // Apply sorting
        filteredTasks.sort((a, b) => {
            if (sortBy === 'dueDate') {
                return new Date(a.dueDate) - new Date(b.dueDate);
            } else if (sortBy === 'priority') {
                const pWeight = { high: 3, medium: 2, low: 1 };
                return pWeight[b.priority] - pWeight[a.priority];
            } else if (sortBy === 'subject') {
                return (a.subject || '').localeCompare(b.subject || '');
            }
            return 0;
        });
        // Update task count indicators
        const allCount = this.state.tasks.length;
        const pendingCount = this.state.tasks.filter(t => !t.completed).length;
        const completedCount = allCount - pendingCount;
        this.countAllTasks.textContent = allCount;
        this.countPendingTasks.textContent = pendingCount;
        this.countCompletedTasks.textContent = completedCount;
        // Build list
        this.tasksListRoot.innerHTML = '';
        if (filteredTasks.length === 0) {
            this.tasksListRoot.innerHTML = `
                <div class="empty-state">
                    <i class="fa-solid fa-clipboard-question"></i>
                </div>`;
        } else {
            const todayStr = new Date().toISOString().split('T')[0];
            filteredTasks.forEach(task => {
                const item = document.createElement('div');
                item.className = `task-card-item ${task.completed ? 'completed' : ''}`;
                
                // Due date warning styling
                const isOverdue = !task.completed && task.dueDate < todayStr;
                item.innerHTML = `
                    <div class="task-card-left">
                        <div class="task-checkbox-huge" onclick="app.toggleTaskCompletion('${task.id}')">
                            <i class="fa-solid fa-check"></i>
                        </div>
                        <div class="task-card-info">
                            <h4>${task.title}</h4>
                            <div class="task-card-meta">
                                <span class="task-meta-due ${isOverdue ? 'overdue' : ''}">
                                </span>
                            </div>
                        </div>
                    </div>
                    <div class="task-card-right">
                            <i class="fa-solid fa-pen"></i>
                        </button>
                            <i class="fa-solid fa-trash-can"></i>
                        </button>
                    </div>
                `;
                this.tasksListRoot.appendChild(item);
            });
        }
    }
    openTaskModal(taskId = null) {
        this.taskForm.reset();
        if (taskId) {
            // EDIT MODE
            this.taskModalTitle.textContent = "แก้ไขงาน / การบ้าน";
            const task = this.state.tasks.find(t => t.id === taskId);
            
            if (task) {
                document.getElementById('edit-task-id').value = task.id;
                document.getElementById('task-title').value = task.title;
                document.getElementById('task-subject').value = task.subject || '';
                document.getElementById('task-priority').value = task.priority;
                document.getElementById('task-due-date').value = task.dueDate;
                document.getElementById('task-notes').value = task.notes || '';
            }
        } else {
            // ADD MODE
            this.taskModalTitle.textContent = "เพิ่มรายการงานใหม่";
            document.getElementById('edit-task-id').value = "";
            
            // Default due date to tomorrow
            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);
            document.getElementById('task-due-date').value = tomorrow.toISOString().split('T')[0];
        }
        this.taskModal.classList.add('active');
    }
    closeTaskModal() {
        this.taskModal.classList.remove('active');
        this.taskForm.reset();
    }
    handleTaskSubmit(e) {
        e.preventDefault();
        const id = document.getElementById('edit-task-id').value;
        const title = document.getElementById('task-title').value.trim();
        const subject = document.getElementById('task-subject').value.trim();
        const priority = document.getElementById('task-priority').value;
        const dueDate = document.getElementById('task-due-date').value;
        const notes = document.getElementById('task-notes').value.trim();
        if (!title || !dueDate) {
            return;
        }
        if (id) {
            // Edit
            const taskIndex = this.state.tasks.findIndex(t => t.id === id);
            if (taskIndex !== -1) {
                this.state.tasks[taskIndex] = {
                    ...this.state.tasks[taskIndex],
                    title, subject, priority, dueDate, notes
                };
                this.addToSyncQueue('upsert', id, this.state.tasks[taskIndex]);
            }
        } else {
            // Add new
            const newTask = {
                id: generateUUID(),
                title, subject, priority, dueDate, notes,
                completed: false
            };
            this.state.tasks.push(newTask);
            this.addToSyncQueue('upsert', newTask.id, newTask);
        }
        this.saveState();
        this.closeTaskModal();
        this.renderAll();
    }
    toggleTaskCompletion(taskId) {
        const task = this.state.tasks.find(t => t.id === taskId);
        if (task) {
            task.completed = !task.completed;
            
            // If completed, let's trigger a small visual success log or add to focus metrics
            if (task.completed) {
                this.state.pomodoro.sessions += 0.25; // reward: completing an assignment counts as focus progress!
                this.state.pomodoro.minutes += 5;     // reward: 5 virtual focus minutes
            }
            
            this.saveState();
            this.addToSyncQueue('upsert', taskId, task);
            this.renderAll();
        }
    }
    deleteTask(taskId) {
        if (confirm("คุณต้องการลบงานนี้ออกใช่หรือไม่?")) {
            this.state.tasks = this.state.tasks.filter(t => t.id !== taskId);
            this.saveState();
            this.addToSyncQueue('delete', taskId);
            this.renderAll();
        }
    }
    // ----------------------------------------------------
    // POMODORO TIMER VIEW
    // ----------------------------------------------------
    renderPomodoro() {
        this.updateTimerDisplay();
        
        // Show status focus metric
        if (this.pomodoroSessionCount) this.pomodoroSessionCount.textContent = Math.floor(this.state.pomodoro.sessions);
        if (this.pomodoroFocusMinutes) this.pomodoroFocusMinutes.textContent = Math.round(this.state.pomodoro.minutes);
        
        // Update active modes styling
        this.pomodoroModes.forEach(btn => {
            if (btn.getAttribute('data-mode') === this.state.pomodoro.activeMode) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
    }
    setPomodoroMode(mode, duration) {
        this.pausePomodoroTimer();
        
        this.state.pomodoro.activeMode = mode;
        this.state.pomodoro.duration = duration;
        this.state.pomodoro.timeLeft = duration;
        this.state.pomodoro.isRunning = false;
        
        this.saveState();
        this.renderPomodoro();
    }
    togglePomodoro() {
        if (this.state.pomodoro.isRunning) {
            this.pausePomodoroTimer();
        } else {
            this.startPomodoroTimer();
        }
    }
    startPomodoroTimer() {
        // Initialize Web Audio Context on first interaction
        this.initAudioContext();
        this.state.pomodoro.isRunning = true;
        
        // Toggle play icon to pause
        this.timerPlayPauseBtn.innerHTML = '<i class="fa-solid fa-pause"></i>';
        this.timerPlayPauseBtn.style.background = 'var(--color-rose-gradient)';
        this.miniTimerPlayBtn.innerHTML = '<i class="fa-solid fa-pause"></i>';
        this.timerInterval = setInterval(() => {
            this.state.pomodoro.timeLeft--;
            
            // Accrue stats every 60 seconds of focus
            if (this.state.pomodoro.activeMode === 'study' && this.state.pomodoro.timeLeft % 60 === 0) {
                this.state.pomodoro.minutes += 1;
            }
            if (this.state.pomodoro.timeLeft <= 0) {
                this.handleTimerComplete();
            }
            this.updateTimerDisplay();
        }, 1000);
        
        this.saveState();
    }
    pausePomodoroTimer() {
        this.state.pomodoro.isRunning = false;
        clearInterval(this.timerInterval);
        
        // Toggle icon back
        this.timerPlayPauseBtn.innerHTML = '<i class="fa-solid fa-play"></i>';
        this.timerPlayPauseBtn.style.background = 'var(--accent-B-grad)';
        this.miniTimerPlayBtn.innerHTML = '<i class="fa-solid fa-play"></i>';
        this.saveState();
    }
    resetPomodoro() {
        this.pausePomodoroTimer();
        this.state.pomodoro.timeLeft = this.state.pomodoro.duration;
        this.updateTimerDisplay();
    }
    updateTimerDisplay() {
        const mins = Math.floor(this.state.pomodoro.timeLeft / 60);
        const secs = this.state.pomodoro.timeLeft % 60;
        const timeStr = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
        // Circular progress recalculate
        const circumference = 565.48; // Circumference of radius 90 circle
        const progress = 1 - (this.state.pomodoro.timeLeft / this.state.pomodoro.duration);
        const offset = circumference * progress;
        
        if (this.timerProgressCircle) {
            this.timerProgressCircle.style.strokeDashoffset = offset;
            
            // Set dynamic glowing color based on mode
            if (this.state.pomodoro.activeMode === 'study') {
                this.timerProgressCircle.style.stroke = 'var(--accent-B)';
            } else {
                this.timerProgressCircle.style.stroke = 'var(--color-emerald)';
            }
        }
        // Apply time texts
        if (this.timerTime) this.timerTime.textContent = timeStr;
        if (this.miniTimerTime) this.miniTimerTime.textContent = timeStr;
        
        // Title tab timer sync
        document.title = `(${timeStr}) Study Table - จัดตารางเรียน`;
        // Text statuses in Thai
        if (this.timerStatus) {
            if (this.state.pomodoro.activeMode === 'study') {
                this.timerStatus.textContent = "ช่วงเวลาโฟกัสเรียน ✍️";
                this.timerStatus.style.color = "var(--accent-B)";
            } else if (this.state.pomodoro.activeMode === 'short-break') {
                this.timerStatus.textContent = "ช่วงเวลาพักสั้น ☕";
                this.timerStatus.style.color = "var(--color-emerald)";
            } else {
                this.timerStatus.style.color = "var(--color-blue)";
            }
        }
    }
    handleTimerComplete() {
        this.pausePomodoroTimer();
        
        // Ring sound emulation
        this.playCompleteChime();
        if (this.state.pomodoro.activeMode === 'study') {
            this.state.pomodoro.sessions += 1;
            this.setPomodoroMode('short-break', 300);
        } else {
            this.setPomodoroMode('study', 1500);
        }
        this.saveState();
        this.renderAll();
    }
    // ----------------------------------------------------
    // WEB AUDIO API - SYNTHESIZER AND AUDIO PIPELINE
    // ----------------------------------------------------
    initAudioContext() {
        if (this.audioCtx) return;
        
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) return;
        this.audioCtx = new AudioContextClass();
    }
    playCompleteChime() {
        this.initAudioContext();
        if (!this.audioCtx) return;
        // Beautiful synthesized chime: high tone, low sustain bell
        const osc1 = this.audioCtx.createOscillator();
        const osc2 = this.audioCtx.createOscillator();
        const gainNode = this.audioCtx.createGain();
        osc1.connect(gainNode);
        osc2.connect(gainNode);
        gainNode.connect(this.audioCtx.destination);
        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(523.25, this.audioCtx.currentTime); // C5
        osc1.frequency.exponentialRampToValueAtTime(1046.50, this.audioCtx.currentTime + 0.3); // C6
        osc2.type = 'triangle';
        osc2.frequency.setValueAtTime(659.25, this.audioCtx.currentTime); // E5
        osc2.frequency.exponentialRampToValueAtTime(1318.51, this.audioCtx.currentTime + 0.3); // E6
        gainNode.gain.setValueAtTime(0.5, this.audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.001, this.audioCtx.currentTime + 1.2);
        osc1.start(this.audioCtx.currentTime);
        osc2.start(this.audioCtx.currentTime);
        osc1.stop(this.audioCtx.currentTime + 1.2);
        osc2.stop(this.audioCtx.currentTime + 1.2);
    }
    toggleAmbientSound(soundKey) {
        this.initAudioContext();
        if (!this.audioCtx) {
            return;
        }
        // Toggle sound playing state
        if (this.soundPlaying[soundKey]) {
            this.stopAmbientSound(soundKey);
        } else {
            this.startAmbientSound(soundKey);
        }
    }
    startAmbientSound(soundKey) {
        if (this.audioCtx.state === 'suspended') {
            this.audioCtx.resume();
        }
        this.soundPlaying[soundKey] = true;
        const container = document.getElementById(`sound-${soundKey}`);
        container.classList.add('playing');
        
        const btn = container.querySelector('.sound-toggle-btn');
        btn.innerHTML = '<i class="fa-solid fa-stop"></i>';
        // Synthesize dynamic sounds
        if (soundKey === 'rain') {
            this.synthesizeRain();
        } else if (soundKey === 'lofi') {
            this.synthesizeLoFi();
        } else if (soundKey === 'forest') {
            this.synthesizeForest();
        }
    }
    stopAmbientSound(soundKey) {
        this.soundPlaying[soundKey] = false;
        
        const container = document.getElementById(`sound-${soundKey}`);
        container.classList.remove('playing');
        
        const btn = container.querySelector('.sound-toggle-btn');
        btn.innerHTML = '<i class="fa-solid fa-play"></i>';
        // Disconnect and cleanup oscillators/buffers
        if (this.ambientNodes[soundKey]) {
            try {
                this.ambientNodes[soundKey].stop();
            } catch(e) {}
            this.ambientNodes[soundKey] = null;
        }
    }
    updateVolume() {
        // Set volume parameter dynamically in synthesized active sound nodes
        // (Handled below inside synthesizers referencing app.volume)
    }
    // 1. Synthesize Rain using white noise generator buffer
    synthesizeRain() {
        const bufferSize = 2 * this.audioCtx.sampleRate;
        const noiseBuffer = this.audioCtx.createBuffer(1, bufferSize, this.audioCtx.sampleRate);
        const output = noiseBuffer.getChannelData(0);
        
        for (let i = 0; i < bufferSize; i++) {
            output[i] = Math.random() * 2 - 1;
        }
        const whiteNoise = this.audioCtx.createBufferSource();
        whiteNoise.buffer = noiseBuffer;
        whiteNoise.loop = true;
        // Bandpass and Lowpass filter rain sound
        const rainFilter = this.audioCtx.createBiquadFilter();
        rainFilter.type = 'lowpass';
        rainFilter.frequency.value = 1400;
        const gainNode = this.audioCtx.createGain();
        gainNode.gain.value = this.volume * 0.4; // Rain soft master
        whiteNoise.connect(rainFilter);
        rainFilter.connect(gainNode);
        gainNode.connect(this.audioCtx.destination);
        whiteNoise.start();
        this.ambientNodes.rain = whiteNoise;
        // Dynamic parameter updater
        const volInterval = setInterval(() => {
            if (!this.soundPlaying.rain) {
                clearInterval(volInterval);
                return;
            }
            gainNode.gain.value = this.volume * 0.4;
        }, 100);
    }
    // 2. Synthesize relaxing deep Forest winds & simulated bird chirping oscillators
    synthesizeForest() {
        // Wind noise
        const bufferSize = 2 * this.audioCtx.sampleRate;
        const noiseBuffer = this.audioCtx.createBuffer(1, bufferSize, this.audioCtx.sampleRate);
        const output = noiseBuffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            output[i] = Math.random() * 2 - 1;
        }
        const windSource = this.audioCtx.createBufferSource();
        windSource.buffer = noiseBuffer;
        windSource.loop = true;
        const filter = this.audioCtx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = 300;
        filter.Q.value = 1.5;
        const masterGain = this.audioCtx.createGain();
        masterGain.gain.value = this.volume * 0.5;
        windSource.connect(filter);
        filter.connect(masterGain);
        masterGain.connect(this.audioCtx.destination);
        windSource.start();
        // Modulate wind frequency for gusts
        const windModulator = this.audioCtx.createOscillator();
        const modGain = this.audioCtx.createGain();
        windModulator.frequency.value = 0.08; // Very slow gust frequency
        modGain.gain.value = 150; // frequency swing
        windModulator.connect(modGain);
        modGain.connect(filter.frequency);
        windModulator.start();
        this.ambientNodes.forest = {
            stop: () => {
                windSource.stop();
                windModulator.stop();
                try { clearInterval(chirpTimer); } catch(e) {}
            }
        };
        // Periodic bird chirps simulator using oscillators
        const playBirdChirp = () => {
            if (!this.soundPlaying.forest) return;
            
            const chirpCtx = this.audioCtx;
            const osc = chirpCtx.createOscillator();
            const gain = chirpCtx.createGain();
            
            osc.connect(gain);
            gain.connect(masterGain);
            
            osc.type = 'sine';
            const baseFreq = 2500 + Math.random() * 800;
            osc.frequency.setValueAtTime(baseFreq, chirpCtx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(baseFreq + 500, chirpCtx.currentTime + 0.15);
            
            gain.gain.setValueAtTime(0.001, chirpCtx.currentTime);
            gain.gain.linearRampToValueAtTime(this.volume * 0.08, chirpCtx.currentTime + 0.03);
            gain.gain.exponentialRampToValueAtTime(0.001, chirpCtx.currentTime + 0.18);
            
            osc.start();
            osc.stop(chirpCtx.currentTime + 0.2);
        };
        const chirpTimer = setInterval(() => {
            if (!this.soundPlaying.forest) {
                clearInterval(chirpTimer);
                return;
            }
            if (Math.random() > 0.4) {
                playBirdChirp();
                // Double chirp chain
                setTimeout(() => playBirdChirp(), 200 + Math.random() * 200);
            }
        }, 3000);
        // Vol updater loop
        const volInterval = setInterval(() => {
            if (!this.soundPlaying.forest) {
                clearInterval(volInterval);
                return;
            }
            masterGain.gain.value = this.volume * 0.5;
        }, 100);
    }
    // 3. Synthesize relaxing deep warm chords to simulate Lo-Fi ambient music
    synthesizeLoFi() {
        const lofiCtx = this.audioCtx;
        const mainGain = lofiCtx.createGain();
        mainGain.gain.value = this.volume * 0.35;
        mainGain.connect(lofiCtx.destination);
        // Low warm ambient synth pad nodes
        const chords = [
            [261.63, 329.63, 392.00, 493.88], // Cmaj7
            [293.66, 349.23, 440.00, 523.25], // Dm7
            [220.00, 261.63, 329.63, 392.00], // Am7
            [349.23, 440.00, 523.25, 587.33]  // Fmaj7
        ];
        let chordIdx = 0;
        
        const playWarmPad = () => {
            if (!this.soundPlaying.lofi) return;
            const now = lofiCtx.currentTime;
            const currentChord = chords[chordIdx];
            const oscNodes = [];
            // Spawn oscillator for each note in chord
            currentChord.forEach(freq => {
                const osc = lofiCtx.createOscillator();
                const gain = lofiCtx.createGain();
                
                osc.type = 'triangle';
                // slightly detune to create a warm chorus sound
                osc.frequency.value = freq + (Math.random() * 2 - 1);
                
                // Add a very subtle low pass filter to make it sound fuzzy and vintage
                const lp = lofiCtx.createBiquadFilter();
                lp.type = 'lowpass';
                lp.frequency.value = 800;
                osc.connect(lp);
                lp.connect(gain);
                gain.connect(mainGain);
                gain.gain.setValueAtTime(0.001, now);
                gain.gain.linearRampToValueAtTime(0.12, now + 1.5); // Slow attack
                gain.gain.setValueAtTime(0.12, now + 5.0);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 8.0); // Slow decay
                osc.start(now);
                osc.stop(now + 8.0);
                oscNodes.push(osc);
            });
            chordIdx = (chordIdx + 1) % chords.length;
            const nextBeatTime = setTimeout(() => {
                if (this.soundPlaying.lofi) playWarmPad();
            }, 7000); // Overlay beats smoothly
            // Store hooks to kill
            this.ambientNodes.lofi.osc = oscNodes;
            this.ambientNodes.lofi.timer = nextBeatTime;
        };
        this.ambientNodes.lofi = {
            stop: () => {
                try {
                    clearTimeout(this.ambientNodes.lofi.timer);
                    if (this.ambientNodes.lofi.osc) {
                        this.ambientNodes.lofi.osc.forEach(o => o.stop());
                    }
                } catch(e) {}
            }
        };
        playWarmPad();
        // Vol updater loop
        const volInterval = setInterval(() => {
            if (!this.soundPlaying.lofi) {
                clearInterval(volInterval);
                return;
            }
            mainGain.gain.value = this.volume * 0.35;
        }, 100);
    }
    // ----------------------------------------------------
    // ANALYTICS VIEW
    // ----------------------------------------------------
    renderAnalytics() {
        const totalCourses = this.state.timetable_A.length + this.state.timetable_B.length;
        const totalTasksCompleted = this.state.tasks.filter(t => t.completed).length;
        const focusMinutes = Math.round(this.state.pomodoro.minutes);
        
        document.getElementById('analytics-total-courses').textContent = `${totalCourses} วิชา`;
        document.getElementById('analytics-completed-tasks').textContent = `${totalTasksCompleted} งาน`;
        document.getElementById('analytics-total-hours').textContent = `${(focusMinutes / 60).toFixed(1)} ชม.`;
        // Render comprehensive course table summary
        const tbody = document.getElementById('course-manager-table-body');
        tbody.innerHTML = '';
        const allSlots = [
            ...this.state.timetable_A.map(c => ({ ...c, week: 'A' })),
            ...this.state.timetable_B.map(c => ({ ...c, week: 'B' }))
        ];
        if (allSlots.length === 0) {
        } else {
            // Sort by week, day, time
            allSlots.sort((a,b) => {
                if (a.week !== b.week) return a.week.localeCompare(b.week);
                if (a.day !== b.day) return a.day - b.day;
                return a.startTime.localeCompare(b.startTime);
            });
            allSlots.forEach(slot => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td><span class="table-week-badge week-${slot.week}">สัปดาห์ ${slot.week}</span></td>
                    <td><strong>${slot.name}</strong></td>
                    <td>${slot.room || '-'}</td>
                    <td>${slot.teacher || '-'}</td>
                    <td>${dayNames[slot.day]} | ${slot.startTime} - ${slot.endTime}</td>
                    <td><span class="table-color-dot" style="background-color:${slot.color}"></span></td>
                    <td>
                    </td>
                `;
                tbody.appendChild(tr);
            });
        }
        // Render massive full analytics charts
        this.renderDetailedChart();
    }
    renderMiniChart() {
        const container = document.getElementById('mini-chart-svg-container');
        if (!container) return;
        // Daily weights mock or derived values
        const days = ['จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.', 'อา.'];
        
        // Calculate simulated workload based on timetables classes count + completed homework
        const workload = [0, 0, 0, 0, 0, 0, 0];
        
        // Active week classes weights
        const currentTimetable = this.state.active_week === 'A' ? this.state.timetable_A : this.state.timetable_B;
        currentTimetable.forEach(slot => {
            const index = [1, 2, 3, 4, 5, 6, 0].indexOf(parseInt(slot.day));
            if (index !== -1) workload[index] += 1.5; // each class is 1.5 hours
        });
        // Add Pomodoro focus minutes distributed randomly
        const totalFocus = this.state.pomodoro.minutes / 60;
        workload[0] += totalFocus * 0.2;
        workload[2] += totalFocus * 0.3;
        workload[3] += totalFocus * 0.2;
        workload[4] += totalFocus * 0.3;
        const maxVal = Math.max(...workload, 4); // ceiling minimum of 4 hours
        // Draw nice compact vertical bars
        let svgContent = `
            <svg class="chart-svg" viewBox="0 0 320 120">
                <defs>
                    <linearGradient id="barGradientMini" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stop-color="var(--accent-B)" />
                        <stop offset="100%" stop-color="rgba(185, 39, 252, 0.2)" />
                    </linearGradient>
                </defs>
        `;
        // Draw columns
        const colWidth = 25;
        const spacing = 18;
        const xOffset = 25;
        const bottomY = 100;
        // horizontal gridlines
        svgContent += `<line x1="15" y1="20" x2="310" y2="20" stroke="rgba(255,255,255,0.03)" stroke-width="1" />`;
        svgContent += `<line x1="15" y1="60" x2="310" y2="60" stroke="rgba(255,255,255,0.03)" stroke-width="1" />`;
        
        // base axis line
        svgContent += `<line x1="15" y1="${bottomY}" x2="310" y2="${bottomY}" class="chart-axis-line" />`;
        workload.forEach((val, i) => {
            const x = xOffset + i * (colWidth + spacing);
            const height = (val / maxVal) * 75; // max height 75px
            const y = bottomY - height;
            svgContent += `
                <text x="${x + colWidth/2}" y="${bottomY + 15}" class="chart-label-text">${days[i]}</text>
            `;
        });
        svgContent += `</svg>`;
        container.innerHTML = svgContent;
    }
    renderDetailedChart() {
        const container = document.getElementById('detailed-chart-svg-container');
        if (!container) return;
        // Calculate hours of Week A and Week B to compare workload
        const weekAWorkload = [0, 0, 0, 0, 0, 0, 0];
        const weekBWorkload = [0, 0, 0, 0, 0, 0, 0];
        const daysMapping = [1, 2, 3, 4, 5, 6, 0];
        this.state.timetable_A.forEach(slot => {
            const idx = daysMapping.indexOf(parseInt(slot.day));
            if (idx !== -1) {
                const [sh, sm] = slot.startTime.split(':').map(Number);
                const [eh, em] = slot.endTime.split(':').map(Number);
                weekAWorkload[idx] += (eh * 60 + em - (sh * 60 + sm)) / 60;
            }
        });
        this.state.timetable_B.forEach(slot => {
            const idx = daysMapping.indexOf(parseInt(slot.day));
            if (idx !== -1) {
                const [sh, sm] = slot.startTime.split(':').map(Number);
                const [eh, em] = slot.endTime.split(':').map(Number);
                weekBWorkload[idx] += (eh * 60 + em - (sh * 60 + sm)) / 60;
            }
        });
        // Add Pomodoro focus time to current week
        const currentWeekWorkload = this.state.active_week === 'A' ? weekAWorkload : weekBWorkload;
        const focusHours = this.state.pomodoro.minutes / 60;
        currentWeekWorkload[0] += focusHours * 0.25;
        currentWeekWorkload[2] += focusHours * 0.25;
        currentWeekWorkload[3] += focusHours * 0.25;
        currentWeekWorkload[4] += focusHours * 0.25;
        const maxVal = Math.max(...weekAWorkload, ...weekBWorkload, 5);
        let svgContent = `
            <svg class="chart-svg" viewBox="0 0 600 240">
                <defs>
                    <linearGradient id="barGradA" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stop-color="var(--color-blue)" />
                        <stop offset="100%" stop-color="rgba(0, 242, 254, 0.1)" />
                    </linearGradient>
                    <linearGradient id="barGradB" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stop-color="var(--color-purple)" />
                        <stop offset="100%" stop-color="rgba(185, 39, 252, 0.1)" />
                    </linearGradient>
                </defs>
        `;
        const colWidth = 24;
        const groupSpacing = 16;
        const daySpacing = 42;
        const xOffset = 50;
        const bottomY = 200;
        // horizontal gridlines & markers
        for (let i = 0; i <= 4; i++) {
            const hVal = (maxVal * (i / 4)).toFixed(1);
            const gridY = bottomY - (i / 4) * 150;
            svgContent += `
                <line x1="40" y1="${gridY}" x2="570" y2="${gridY}" stroke="rgba(255,255,255,0.03)" stroke-width="1" />
            `;
        }
        // Base Axis
        svgContent += `<line x1="40" y1="${bottomY}" x2="570" y2="${bottomY}" class="chart-axis-line" />`;
        days.forEach((day, i) => {
            const groupX = xOffset + i * (2 * colWidth + groupSpacing + daySpacing);
            
            const heightA = (weekAWorkload[i] / maxVal) * 150;
            const yA = bottomY - heightA;
            const heightB = (weekBWorkload[i] / maxVal) * 150;
            const yB = bottomY - heightB;
            // Draw Bar Week A
            svgContent += `
            `;
            // Draw Bar Week B
            svgContent += `
            `;
            // Draw Day label centering on groups
            const textX = groupX + colWidth + groupSpacing / 2;
            svgContent += `
            `;
        });
        svgContent += `</svg>`;
        container.innerHTML = svgContent;
    }
    // ----------------------------------------------------
    // GOOGLE SHEETS SYNC METHODS
    // ----------------------------------------------------
    updateSyncUI() {
        if (!this.syncAppScriptUrl) return;
        // Set inputs/values
        const url = this.state.settings ? this.state.settings.googleScriptUrl : "";
        this.syncAppScriptUrl.value = url || "";
        // Update badge and controls based on connection and state
        if (!url) {
            if (this.syncStatusBadge) {
                this.syncStatusBadge.className = "sync-status-badge badge-disconnected";
            }
            if (this.clearSyncUrlBtn) this.clearSyncUrlBtn.style.display = "none";
            if (this.saveSyncUrlBtn) this.saveSyncUrlBtn.textContent = "เชื่อมต่อ";
        } else {
            if (this.state.isSyncing) {
                if (this.syncStatusBadge) {
                    this.syncStatusBadge.className = "sync-status-badge badge-syncing";
                }
                if (this.manualSyncIcon) this.manualSyncIcon.classList.add('spin-icon');
            } else {
                if (this.syncStatusBadge) {
                    this.syncStatusBadge.className = "sync-status-badge badge-connected";
                }
                if (this.manualSyncIcon) this.manualSyncIcon.classList.remove('spin-icon');
            }
            if (this.clearSyncUrlBtn) this.clearSyncUrlBtn.style.display = "inline-flex";
            if (this.saveSyncUrlBtn) this.saveSyncUrlBtn.textContent = "อัปเดต";
        }
        // Update queue count
        const count = this.state.syncQueue ? this.state.syncQueue.length : 0;
        if (this.syncQueueCount) {
            this.syncQueueCount.textContent = count;
        }
    }
    addToSyncQueue(type, id, task = null) {
        if (!this.state.syncQueue) {
            this.state.syncQueue = [];
        }
        // If there's already a change in queue for this ID, merge or replace it
        const existingIndex = this.state.syncQueue.findIndex(q => q.id === id);
        
        if (existingIndex !== -1) {
            const existing = this.state.syncQueue[existingIndex];
            if (type === 'delete') {
                // If it's a delete, we replace any previous action with delete
                this.state.syncQueue[existingIndex] = { type, id };
            } else {
                // If it's an upsert and the previous was also upsert, update the task
                if (existing.type === 'upsert') {
                    this.state.syncQueue[existingIndex] = { type, id, task };
                } else {
                    // If previous was delete, and now we upsert, replace it
                    this.state.syncQueue[existingIndex] = { type, id, task };
                }
            }
        } else {
            this.state.syncQueue.push({ type, id, task });
        }
        
        this.saveState();
        this.updateSyncUI();

        // Sync with Supabase in real-time if configured and profile is logged in
        if (supabaseClient && this.state.profile) {
            const profileUUID = this.state.profile.id;
            if (profileUUID) {
                if (type === 'upsert' && task) {
                    supabaseClient.from('tasks').upsert({
                        id: id,
                        profile_id: profileUUID,
                        title: task.title,
                        subject: task.subject || "",
                        priority: task.priority || "medium",
                        duedate: task.dueDate,
                        notes: task.notes || "",
                        completed: task.completed ? true : false
                    }).then(({ error }) => {
                        if (error) console.error("Error syncing task to Supabase:", error);
                        else console.log("Task synced successfully to Supabase!");
                    });
                } else if (type === 'delete') {
                    supabaseClient.from('tasks')
                        .delete()
                        .eq('id', id)
                        .then(({ error }) => {
                            if (error) console.error("Error deleting task from Supabase:", error);
                            else console.log("Task deleted successfully from Supabase!");
                        });
                }
            }
        }
        
        // Trigger auto-sync in the background
        this.syncWithSheet();
    }
    async syncWithSheet(forceFetch = false) {
        if (!this.state.settings || !this.state.settings.googleScriptUrl) {
            this.updateSyncUI();
            return;
        }
        const url = this.state.settings.googleScriptUrl;
        // If currently syncing, don't trigger another one
        if (this.state.isSyncing) return;
        // Only sync if there are changes OR forceFetch is requested
        if ((!this.state.syncQueue || this.state.syncQueue.length === 0) && !forceFetch) {
            this.updateSyncUI();
            return;
        }
        this.state.isSyncing = true;
        this.updateSyncUI();
        // Capture queue state at this moment to clear only what was sent
        const changesSent = this.state.syncQueue ? [...this.state.syncQueue] : [];
        
        try {
            console.log('[Google Sheet Sync] Starting sync. Queue length:', changesSent.length);
            
            // Post as text/plain to avoid CORS OPTIONS preflight blocking
            const response = await fetch(url, {
                method: 'POST',
                mode: 'cors',
                headers: {
                    'Content-Type': 'text/plain'
                },
                body: JSON.stringify({ changes: changesSent })
            });
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json();
            
            if (data && data.success) {
                // Remove the changes we successfully uploaded from the queue
                if (this.state.syncQueue) {
                    this.state.syncQueue = this.state.syncQueue.filter(
                        item => !changesSent.some(sent => sent.id === item.id && sent.type === item.type)
                    );
                }
                
                // Update local tasks with the source of truth from Sheets
                if (data.tasks) {
                    this.state.tasks = data.tasks;
                }
                
                this.saveState();
                this.renderAll();
                console.log('[Google Sheet Sync] Sync successful. Tasks count:', this.state.tasks.length);
            } else {
                throw new Error(data ? data.error : "Unknown Apps Script error");
            }
        } catch (error) {
            console.error('[Google Sheet Sync] Sync failed:', error);
            // If it was a manual/forced sync, alert the user about the failure
            if (forceFetch) {
            }
        } finally {
            this.state.isSyncing = false;
            this.updateSyncUI();
        }
    }
    
    // ----------------------------------------------------
    // ADMIN / STUDENT MANAGEMENT
    // ----------------------------------------------------
    renderAdmin() {
        if (!this.state.profile || this.state.profile.nickname.toLowerCase() !== 'goragod') {
            this.switchView('dashboard');
            return;
        }

        const renderList = (studentsList) => {
            if (!this.adminStudentListContainer) return;
            this.adminStudentListContainer.innerHTML = '';
            
            if (this.adminStudentCount) {
                this.adminStudentCount.textContent = studentsList.length;
            }

            if (studentsList.length === 0) {
                this.adminStudentListContainer.innerHTML = `
                    <div class="empty-state" style="grid-column: 1 / -1; text-align: center; padding: 3rem;">
                        <i class="fa-solid fa-users-slash" style="font-size: 3rem; opacity: 0.3; margin-bottom: 1rem; display: block;"></i>
                        <p style="color: var(--text-secondary);">ไม่พบข้อมูลนักเรียน</p>
                    </div>`;
                return;
            }

            const dayNames = ['วันอาทิตย์', 'วันจันทร์', 'วันอังคาร', 'วันพุธ', 'วันพฤหัสบดี', 'วันศุกร์', 'วันเสาร์'];

            studentsList.forEach(student => {
                const card = document.createElement('div');
                card.className = 'glass-card student-admin-card animate-zoom';
                card.style.cssText = `
                    padding: 1.25rem;
                    border-radius: 16px;
                    border: 1px solid var(--border-color);
                    background: var(--bg-card);
                    display: flex;
                    flex-direction: column;
                    gap: 0.75rem;
                    position: relative;
                    overflow: hidden;
                    transition: var(--transition-smooth);
                `;
                
                // Parse nickname and classroom
                const nickname = student.nickname || student.name || "ไม่ระบุชื่อ";
                const classroom = student.classroom || "";
                
                card.innerHTML = `
                    <div style="display: flex; align-items: center; gap: 0.75rem;">
                        <div style="width: 42px; height: 42px; border-radius: 50%; background: var(--accent-B-grad); display: flex; align-items: center; justify-content: center; color: #fff; font-weight: 800; font-size: 1.2rem; box-shadow: var(--shadow-glow);">
                            ${nickname.charAt(0).toUpperCase()}
                        </div>
                        <div style="flex-grow: 1;">
                            <h4 style="margin: 0; font-size: 1rem; font-weight: 700; color: var(--text-primary);">${nickname}</h4>
                            <span style="font-size: 0.75rem; color: var(--text-secondary); font-weight: 600; display: inline-block; padding: 2px 8px; border-radius: 6px; background: rgba(255,255,255,0.05); margin-top: 2px;">
                                <i class="fa-solid fa-graduation-cap"></i> ${classroom || "ไม่ระบุห้องเรียน"}
                            </span>
                        </div>
                    </div>
                    <div style="border-top: 1px solid var(--border-color); padding-top: 0.75rem; display: flex; flex-direction: column; gap: 0.5rem; font-size: 0.8rem;">
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <span style="color: var(--text-muted);">Access Code:</span>
                            <strong style="color: var(--color-blue); font-family: monospace; letter-spacing: 0.5px; cursor: pointer;" class="copy-code-btn" title="คลิกเพื่อคัดลอกรหัส">${student.accessCode || student.access_code || "ไม่มี"}</strong>
                        </div>
                    </div>
                    <div style="display: flex; gap: 0.5rem; margin-top: 0.5rem;">
                        <button class="btn btn-secondary-outline btn-xs view-student-timetable-btn" style="flex: 1; font-size: 0.7rem; justify-content: center; height: 28px;">
                            <i class="fa-solid fa-calendar-days"></i> ดูตารางเรียน
                        </button>
                        <button class="btn btn-rose-outline btn-xs delete-student-btn" style="flex: 0 0 35px; justify-content: center; height: 28px; padding: 0; color: var(--color-rose); border-color: rgba(255, 8, 68, 0.2);">
                            <i class="fa-solid fa-trash-can"></i>
                        </button>
                    </div>
                `;

                // Copy Access Code event
                const copyBtn = card.querySelector('.copy-code-btn');
                if (copyBtn) {
                    copyBtn.addEventListener('click', () => {
                        navigator.clipboard.writeText(copyBtn.textContent).then(() => {
                            alert(`คัดลอกรหัส ${copyBtn.textContent} สำเร็จ!`);
                        });
                    });
                }

                // View student timetable event
                const viewBtn = card.querySelector('.view-student-timetable-btn');
                if (viewBtn) {
                    viewBtn.addEventListener('click', () => {
                        if (confirm(`คุณต้องการดึงข้อมูลตารางเรียนและการบ้านของ ${nickname} มาแสดงผลบนเครื่องนี้ชั่วคราวใช่ไหม?`)) {
                            this.state.profile = {
                                id: student.id || null,
                                nickname: nickname,
                                classroom: classroom,
                                accessCode: student.accessCode || student.access_code
                            };
                            localStorage.setItem('study_table_profile', JSON.stringify(this.state.profile));
                            this.updateSidebarProfile();
                            
                            // Load data
                            if (supabaseClient && student.id) {
                                Promise.all([
                                    supabaseClient.from('tasks').select('*').eq('profile_id', student.id),
                                    supabaseClient.from('timetables').select('*').eq('profile_id', student.id)
                                ]).then(([tasksRes, timetablesRes]) => {
                                    if (tasksRes.data) {
                                        this.state.tasks = tasksRes.data.map(t => ({
                                            id: t.id,
                                            title: t.title,
                                            subject: t.subject || "",
                                            priority: t.priority || "medium",
                                            dueDate: t.duedate || "",
                                            notes: t.notes || "",
                                            completed: t.completed ? true : false
                                        }));
                                    }
                                    if (timetablesRes.data) {
                                        const classes = timetablesRes.data.map(t => ({
                                            id: t.id,
                                            name: t.name,
                                            room: t.room || "",
                                            teacher: t.teacher || "",
                                            day: t.day,
                                            startTime: t.starttime || "",
                                            endTime: t.endtime || "",
                                            color: t.color || "var(--color-blue)",
                                            week: t.week
                                        }));
                                        this.state.timetable_A = classes.filter(c => c.week === 'A');
                                        this.state.timetable_B = classes.filter(c => c.week === 'B');
                                    }
                                    this.saveState();
                                    this.renderAll();
                                    alert(`โหลดตารางของ ${nickname} เรียบร้อยแล้ว!`);
                                    this.switchView('dashboard');
                                });
                            } else {
                                this.loadMockData(classroom);
                                this.saveState();
                                this.renderAll();
                                alert(`โหลดตารางเริ่มต้นของห้อง ${classroom} เรียบร้อยแล้ว! (ไม่ได้เชื่อมต่อ Supabase หรือนักเรียนไม่มี UUID)`);
                                this.switchView('dashboard');
                            }
                        }
                    });
                }

                // Delete student event
                const deleteBtn = card.querySelector('.delete-student-btn');
                if (deleteBtn) {
                    deleteBtn.addEventListener('click', () => {
                        if (confirm(`คุณต้องการลบข้อมูลโปรไฟล์ของ ${nickname} ใช่หรือไม่?\n⚠️ การลบจะไม่สามารถกู้คืนได้!`)) {
                            if (supabaseClient && student.id) {
                                // Delete from Supabase
                                supabaseClient.from('profiles').delete().eq('id', student.id).then(() => {
                                    alert(`ลบโปรไฟล์ของ ${nickname} ออกจากระบบคลาวด์เรียบร้อยแล้ว`);
                                    this.fetchAndRenderAdminStudents();
                                });
                            } else {
                                // Fallback/Local delete
                                let localStudents = [];
                                try {
                                    const saved = localStorage.getItem('study_table_students');
                                    if (saved) localStudents = JSON.parse(saved);
                                } catch (e) {}
                                localStudents = localStudents.filter(s => s.accessCode !== (student.accessCode || student.access_code));
                                localStorage.setItem('study_table_students', JSON.stringify(localStudents));
                                alert(`ลบโปรไฟล์ของ ${nickname} ออกจากเครื่องเรียบร้อยแล้ว`);
                                this.fetchAndRenderAdminStudents();
                            }
                        }
                    });
                }

                this.adminStudentListContainer.appendChild(card);
            });
        };

        // Search event binding
        if (this.adminSearchStudent && !this.adminSearchStudent.dataset.bound) {
            this.adminSearchStudent.addEventListener('input', (e) => {
                const query = e.target.value.toLowerCase().trim();
                const filtered = this.adminStudentsData.filter(student => {
                    const nickname = (student.nickname || student.name || "").toLowerCase();
                    const classroom = (student.classroom || "").toLowerCase();
                    return nickname.includes(query) || classroom.includes(query);
                });
                renderList(filtered);
            });
            this.adminSearchStudent.dataset.bound = "true";
        }

        // Fetch data and render
        this.fetchAndRenderAdminStudents = () => {
            if (supabaseClient) {
                // Load from Cloud Supabase
                supabaseClient.from('profiles').select('*').order('created_at', { ascending: false }).then(({ data, error }) => {
                    if (error) {
                        console.error("Failed to fetch students from Supabase:", error);
                        // Fallback to local
                        loadLocalStudents();
                    } else if (data) {
                        this.adminStudentsData = data.map(profile => {
                            const nameVal = profile.name;
                            const match = nameVal.match(/(.*)\s*\((.*)\)/);
                            let nickname = nameVal;
                            let classroom = "";
                            if (match) {
                                nickname = match[1].trim();
                                classroom = match[2].trim();
                            }
                            return {
                                id: profile.id,
                                nickname: nickname,
                                classroom: classroom,
                                accessCode: profile.access_code
                            };
                        });
                        renderList(this.adminStudentsData);
                    }
                });
            } else {
                loadLocalStudents();
            }
        };

        const loadLocalStudents = () => {
            let localStudents = [];
            try {
                const saved = localStorage.getItem('study_table_students');
                if (saved) localStudents = JSON.parse(saved);
            } catch (e) {}
            this.adminStudentsData = localStudents;
            renderList(localStudents);
        };

        // Load initially
        this.fetchAndRenderAdminStudents();
    }

    openClassDetailsModal(slot) {
        const modal = document.getElementById('class-details-modal');
        const nameEl = document.getElementById('class-details-name');
        const colorIndicator = document.getElementById('class-details-color-indicator');
        const weekBadge = document.getElementById('class-details-week-badge');
        const dayBadge = document.getElementById('class-details-day-badge');
        const timeEl = document.getElementById('class-details-time');
        const teacherEl = document.getElementById('class-details-teacher');
        const roomEl = document.getElementById('class-details-room');
        const editBtn = document.getElementById('class-details-edit-btn');
        
        if (!modal) return;
        
        nameEl.textContent = slot.name;
        colorIndicator.style.background = slot.color;
        
        // Setup Week Badge
        weekBadge.textContent = `สัปดาห์ ${slot.week}`;
        weekBadge.className = `table-week-badge week-${slot.week}`;
        if (slot.week === 'A') {
            weekBadge.style.background = 'rgba(217, 119, 6, 0.15)';
            weekBadge.style.color = 'var(--color-blue)';
            weekBadge.style.borderColor = 'rgba(217, 119, 6, 0.3)';
        } else {
            weekBadge.style.background = 'rgba(30, 64, 175, 0.15)';
            weekBadge.style.color = 'var(--color-purple)';
            weekBadge.style.borderColor = 'rgba(30, 64, 175, 0.3)';
        }
        
        // Setup Day Badge
        const dayNames = ['วันอาทิตย์', 'วันจันทร์', 'วันอังคาร', 'วันพุธ', 'วันพฤหัสบดี', 'วันศุกร์', 'วันเสาร์'];
        dayBadge.textContent = dayNames[slot.day];
        
        // Setup details text
        timeEl.textContent = `${slot.startTime} - ${slot.endTime} น.`;
        teacherEl.textContent = slot.teacher || 'ไม่ระบุครูผู้สอน';
        roomEl.textContent = slot.room || 'ไม่ระบุห้องเรียน';
        
        // Setup edit btn visibility based on guest mode
        const isGuest = this.state.profile && this.state.profile.isGuest;
        if (isGuest) {
            editBtn.style.display = 'none';
        } else {
            editBtn.style.display = 'inline-flex';
            // Bind click to open standard edit class modal
            editBtn.onclick = () => {
                this.closeClassDetailsModal();
                this.openClassModal(slot.id);
            };
        }
        
        modal.classList.add('active');
    }
    
    closeClassDetailsModal() {
        const modal = document.getElementById('class-details-modal');
        if (modal) modal.classList.remove('active');
    }
}
// Instantiate App globally for events accessibility
let app;
window.addEventListener('DOMContentLoaded', () => {
    app = new StudyTableApp();
});