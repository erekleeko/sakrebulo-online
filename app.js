import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getFirestore, collection, doc, updateDoc, deleteDoc, onSnapshot, query, orderBy, setDoc, getDocs, addDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyDaQMV5tsxi556X0wCjWaj-W-mLmM0EF2Y",
    authDomain: "sakrebulo.firebaseapp.com",
    projectId: "sakrebulo",
    storageBucket: "sakrebulo.firebasestorage.app",
    messagingSenderId: "1080316572069",
    appId: "1:1080316572069:web:b67cd8e0ba1865fc3ab84c"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const issuesRef = collection(db, "issues");

let currentRole = null;
let loggedInUser = null;

// ტესტირების ექაუნთები
const ADMIN_PASSWORD = "admin";
const DEPUTIES = {
    "1111": { id: "deputy_01", name: "გიორგი გიორგაძე" },
    "2222": { id: "deputy_02", name: "ნინო ნინოშვილი" }
};

window.showHome = () => {
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    document.getElementById('screen-home').classList.add('active');
    document.getElementById('passwordInput').value = "";
    currentRole = null;
};

window.showLogin = (role) => {
    currentRole = role;
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    document.getElementById('screen-login').classList.add('active');
    document.getElementById('loginTitle').innerText = role === 'admin' ? "საკრებულოს თავმჯდომარის პაროლი" : "დეპუტატის PIN კოდი";
    document.getElementById('passwordInput').focus();
};

window.showPublicScreen = () => {
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    document.getElementById('screen-public').classList.add('active');
    initPublicScreen();
};

window.handleEnter = (e) => { if (e.key === 'Enter') login(); };

window.login = () => {
    const input = document.getElementById('passwordInput').value;
    if (currentRole === 'admin') {
        if (input === ADMIN_PASSWORD) {
            document.getElementById('screen-login').classList.remove('active');
            document.getElementById('screen-admin').classList.add('active');
            initAdmin();
        } else { alert("არასწორი პაროლი!"); }
    } else if (currentRole === 'deputy') {
        if (DEPUTIES[input]) {
            loggedInUser = DEPUTIES[input];
            document.getElementById('deputyName').innerText = loggedInUser.name;
            document.getElementById('screen-login').classList.remove('active');
            document.getElementById('screen-deputy').classList.add('active');
            initDeputy();
        } else { alert("არასწორი PIN კოდი!"); }
    }
};

window.logout = () => { loggedInUser = null; showHome(); };


// ============================================
// --- თავმჯდომარის მართვის ლოგიკა და ატვირთვა ---
// ============================================
function initAdmin() {
    // შენი ახალი GAS URL ფაილების ფონურად ასატვირთად
    const GAS_URL = "https://script.google.com/macros/s/AKfycbwc7J-BcA6bhUhXybGlW8MvK7uK5mKuilHD_yJTiAwiHph-qHLhPPkHnjHEUOvYCFdR3w/exec";

    window.uploadAndSave = async function() {
        const title = document.getElementById("issueTitle").value;
        const speaker = document.getElementById("issueSpeaker").value || "არ არის მითითებული";
        const fileInput = document.getElementById("issueFile");
        const btn = document.getElementById("uploadBtn");

        if (!title || fileInput.files.length === 0) {
            return alert("გთხოვთ შეავსოთ სათაური და აირჩიოთ PDF ფაილი!");
        }

        const file = fileInput.files[0];
        btn.innerText = "⏳ იტვირთება დრაივზე..."; 
        btn.disabled = true;

        try {
            const reader = new FileReader();
            reader.onload = async function() {
                const base64Data = reader.result.split(',')[1];
                
                const response = await fetch(GAS_URL, {
                    method: 'POST',
                    redirect: 'follow',
                    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                    body: JSON.stringify({
                        fileName: file.name,
                        mimeType: file.type,
                        base64: base64Data
                    })
                });
                
                const result = await response.json();
                
                if (result.success) {
                    let fileUrl = result.url;
                    
                    if(fileUrl.includes("drive.google.com/file/d/")) {
                        const fileId = fileUrl.match(/\/d\/(.+?)\//)[1];
                        fileUrl = `https://drive.google.com/file/d/${fileId}/preview`;
                    }

                    btn.innerText = "💾 ინახება ბაზაში...";
                    await addDoc(issuesRef, { 
                        title: title, 
                        speaker: speaker,
                        fileUrl: fileUrl, 
                        status: "pending", 
                        createdAt: new Date().toISOString() 
                    });

                    document.getElementById("issueTitle").value = "";
                    document.getElementById("issueSpeaker").value = "";
                    fileInput.value = "";
                } else {
                    throw new Error("დრაივზე ატვირთვა ვერ მოხერხდა");
                }
                
                btn.innerHTML = "⬆️ ატვირთვა და დამატება"; 
                btn.disabled = false;
            };
            
            reader.readAsDataURL(file);

        } catch (error) {
            console.error(error);
            alert("დაფიქსირდა ხარვეზი. სცადეთ თავიდან.");
            btn.innerHTML = "⬆️ ატვირთვა და დამატება"; 
            btn.disabled = false;
        }
    };

    window.changeStatus = async (id, status) => updateDoc(doc(db, "issues", id), { status });
    
    window.deleteIssue = async (id) => {
        if(!confirm("ნამდვილად გსურთ წაშლა?")) return;
        try { await deleteDoc(doc(db, "issues", id)); } 
        catch (e) { console.error(e); }
    };

    // Dashboard-ის ლაივ განახლება
    onSnapshot(query(issuesRef, orderBy("createdAt", "desc")), (snapshot) => {
        const list = document.getElementById("issuesList");
        let htmlContent = ""; 
        
        snapshot.forEach(docSnap => {
            const data = docSnap.data();
            const id = docSnap.id;
            
            let badgeClass = data.status === "pending" ? "badge-pending" : (data.status === "voting" ? "badge-voting" : "badge-closed");
            let statusText = data.status === "pending" ? "მოლოდინში" : (data.status === "voting" ? "🔴 მიმდინარეობს" : "დასრულებული");
            let speakerName = data.speaker || "მომხსენებელი არ არის მითითებული";

            htmlContent += `
                <div class="issue-card">
                    <h3>
                        <span>${data.title}</span> 
                        <span class="status-badge ${badgeClass}">${statusText}</span>
                    </h3>
                    <div class="speaker-tag">👤 მომხსენებელი: ${speakerName}</div>
                    
                    <div class="live-stats" id="stats-${id}">
                        <div style="width: 100%; text-align: center; color: #666; padding: 15px;">⏳ სტატისტიკა იტვირთება...</div>
                    </div>
                    
                    <div class="card-actions">
                        <button class="btn-start" onclick="changeStatus('${id}', 'voting')">▶ დაწყება</button>
                        <button class="btn-stop" onclick="changeStatus('${id}', 'closed')">⏹ დასრულება</button>
                        <button class="btn-del" onclick="deleteIssue('${id}')">🗑 წაშლა</button>
                    </div>
                </div>`;
        });
        list.innerHTML = htmlContent;

        snapshot.forEach(docSnap => {
            const id = docSnap.id;
            onSnapshot(collection(db, "issues", id, "votes"), (voteSnap) => {
                let yes = 0, no = 0, abs = 0;
                voteSnap.forEach(v => {
                    if(v.data().vote === 'yes') yes++;
                    if(v.data().vote === 'no') no++;
                    if(v.data().vote === 'abstain') abs++;
                });
                
                const statDiv = document.getElementById(`stats-${id}`);
                if(statDiv) {
                    statDiv.innerHTML = `
                        <div class="stat-box stat-yes">მომხრე <span>${yes}</span></div>
                        <div class="stat-box stat-no">წინააღმდეგი <span>${no}</span></div>
                        <div class="stat-box stat-abs">თავი შეიკავა <span>${abs}</span></div>
                        <div class="stat-box stat-total">სულ ხმა <span>${yes + no + abs}</span></div>
                    `;
                }
            });
        });
    });
}


// ============================================
// --- საჯარო ეკრანის (ტაბლოს) ლოგიკა ---
// ============================================
function initPublicScreen() {
    onSnapshot(issuesRef, (snapshot) => {
        let activeFound = false;

        snapshot.forEach(docSnap => {
            const data = docSnap.data();

            if (data.status === 'voting') {
                activeFound = true;
                document.getElementById('publicWaiting').style.display = 'none';
                document.getElementById('publicContent').style.display = 'block';
                document.getElementById('publicIssueTitle').innerText = data.title;
                document.getElementById('publicSpeaker').innerText = `მომხსენებელი: ${data.speaker || 'მითითებული არ არის'}`;

                const votesRef = collection(db, "issues", docSnap.id, "votes");
                onSnapshot(votesRef, (voteSnap) => {
                    let yes = 0, no = 0, abs = 0;
                    voteSnap.forEach(v => {
                        if(v.data().vote === 'yes') yes++;
                        if(v.data().vote === 'no') no++;
                        if(v.data().vote === 'abstain') abs++;
                    });

                    const pubStats = document.getElementById('publicStats');
                    if (pubStats) {
                        pubStats.innerHTML = `
                            <div class="stat-box stat-yes">მომხრე <span>${yes}</span></div>
                            <div class="stat-box stat-no">წინააღმდეგი <span>${no}</span></div>
                            <div class="stat-box stat-abs">თავი შეიკავა <span>${abs}</span></div>
                            <div class="stat-box stat-total">სულ ხმა <span>${yes + no + abs}</span></div>
                        `;
                    }
                });
            }
        });

        if (!activeFound) {
            document.getElementById('publicWaiting').style.display = 'block';
            document.getElementById('publicContent').style.display = 'none';
        }
    });
}


// ============================================
// --- დეპუტატის (პლანშეტის) ლოგიკა ---
// ============================================
function initDeputy() {
    let currentId = null;

    onSnapshot(issuesRef, (snapshot) => {
        if (!loggedInUser) return;

        let activeFound = false;
        snapshot.forEach(docSnap => {
            const data = docSnap.data();

            if(data.status === 'voting') {
                activeFound = true;
                if (currentId !== docSnap.id) {
                    currentId = docSnap.id;
                    document.getElementById('btnYes').disabled = false;
                    document.getElementById('btnNo').disabled = false;
                    document.getElementById('btnAbs').disabled = false;
                    document.getElementById('voteIssueTitle').innerText = data.title;
                    document.getElementById('voteSpeaker').innerText = `მომხსენებელი: ${data.speaker || 'მითითებული არ არის'}`;
                    document.getElementById('pdfFrame').src = data.fileUrl; 
                }
                document.getElementById('waiting').style.display = 'none';
                document.getElementById('votingSection').style.display = 'flex';
            }
        });

        if(!activeFound) {
            currentId = null;
            document.getElementById('waiting').style.display = 'flex';
            document.getElementById('votingSection').style.display = 'none';
            document.getElementById('pdfFrame').src = "";
        }
    });

    window.vote = async (v) => {
        if(!currentId || !loggedInUser) return;
        ['btnYes', 'btnNo', 'btnAbs'].forEach(id => document.getElementById(id).disabled = true);

        try {
            await setDoc(doc(db, "issues", currentId, "votes", loggedInUser.id), {
                vote: v, timestamp: new Date().toISOString()
            });
            alert("თქვენი ხმა მიღებულია!");
        } catch (e) {
            alert("შეცდომა! სცადეთ თავიდან.");
            ['btnYes', 'btnNo', 'btnAbs'].forEach(id => document.getElementById(id).disabled = false);
        }
    };
}