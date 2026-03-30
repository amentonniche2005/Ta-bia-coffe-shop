require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, { cors: { origin: "*" } });

// ========== 1. CONNEXION MONGODB ATLAS ==========
const mongoURI = process.env.MONGODB_URI;

mongoose.connect(mongoURI)
    .then(() => console.log("🚀 TA'BIA DB : Connectée avec succès !"))
    .catch(err => { 
        console.error("❌ Erreur critique de connexion DB:", err); 
        process.exit(1); 
    });

// ========== 2. MODÈLES DE DONNÉES (SCHÉMAS) ==========

const Product = mongoose.model('Product', new mongoose.Schema({
    id: Number, nom: String, prix: Number, stock: Number, categorie: String, 
    image: { type: String, default: 'https://via.placeholder.com/150' },
    variantes: { type: String, default: "" }, seuilAlerte: { type: Number, default: 10 }, unite: String
}));

const Movement = mongoose.model('Movement', new mongoose.Schema({
    date: { type: String, default: () => new Date().toLocaleString('fr-FR') },
    type: String, produit: String, produitId: Number, quantite: Number,
    ancienStock: Number, nouveauStock: Number, raison: String
}));

const Inventory = mongoose.model('Inventory', new mongoose.Schema({
    date: { type: String, default: () => new Date().toLocaleString('fr-FR') }, ecarts: Array
}));

const Expense = mongoose.model('Expense', new mongoose.Schema({
    date: { type: String, default: () => new Date().toLocaleString('fr-FR') },
    categorie: String, description: String, montant: Number, mode: String
}));

const Order = mongoose.model('Order', new mongoose.Schema({
    id: Number, numero: String, date: String, timestamp: Number, articles: Array,
    numeroTable: String, statut: { type: String, default: 'en_attente' }, total: Number,
    clientId: String // Pour savoir si ça vient du web
}));

const TableCode = mongoose.model('TableCode', new mongoose.Schema({
    numero: Number, code: String, lastUpdated: Number
}));

// ========== 3. MIDDLEWARES ==========
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3000;
const CAISSE_TOKEN = process.env.CAISSE_TOKEN || '12345678';

// 🛡️ LE VIGILE : Il vérifie que la requête possède bien le Token
function verifierToken(req, res, next) {
    const tokenFourni = req.headers['authorization'];
    if (tokenFourni === CAISSE_TOKEN) {
        next();
    } else {
        console.log("🔒 Tentative d'accès refusée. Token invalide ou manquant.");
        res.status(403).json({ error: "Accès refusé. Token invalide." });
    }
}

// ========== 4. ROUTES API ==========

// --- AUTHENTIFICATION ---
app.post('/api/caisse/verify', (req, res) => {
    if (req.body.token === CAISSE_TOKEN) { res.json({ success: true, message: "Token accepté" }); } 
    else { res.status(401).json({ success: false, message: "Token invalide" }); }
});

// --- GESTION DU STOCK (SÉCURISÉ) ---
// On applique le vigile 'verifierToken' à ces routes
app.get('/api/stock', verifierToken, async (req, res) => {
    try { res.json(await Product.find({}).sort({ id: 1 })); } catch (err) { res.status(500).json(err); }
});

app.post('/api/stock/decrementer', verifierToken, async (req, res) => {
    try {
        for (let art of req.body.articles) {
            const p = await Product.findOneAndUpdate({ id: art.id }, { $inc: { stock: -art.quantite } }, { new: true });
            if(p) {
                await new Movement({ type: 'vente', produit: p.nom, produitId: art.id, quantite: art.quantite, nouveauStock: p.stock, raison: "Vente" }).save();
            }
        }
        io.emit('update_stock');
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// (Les autres routes de gestion de stock devraient aussi avoir verifierToken si tu veux les protéger totalement)

// --- COMMANDES ET CUISINE (SÉCURISÉ) ---

// Créer une commande (Accessible avec Token)
app.post('/api/commandes', verifierToken, async (req, res) => {
    try {
        const cmd = new Order({ 
            ...req.body, id: Date.now(), 
            numero: 'CMD'+Math.floor(Math.random()*10000), 
            date: new Date().toLocaleString('fr-FR'), 
            timestamp: Date.now() 
        });
        await cmd.save();
        io.emit('nouvelle_commande', cmd);
        res.status(201).json(cmd);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Lire les commandes en cours (Accessible avec Token)
app.get('/api/commandes', verifierToken, async (req, res) => {
    try {
        res.json(await Order.find({ statut: { $ne: 'paye' } }));
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Mettre à jour le statut d'une commande (Accessible avec Token)
app.put('/api/commandes/:id/statut', verifierToken, async (req, res) => {
    try {
        const cmd = await Order.findOneAndUpdate({ id: req.params.id }, { statut: req.body.statut }, { new: true });
        io.emit('mise_a_jour_commande', cmd);
        res.json(cmd);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Marquer les commandes d'une table comme payées (Accessible avec Token)
app.put('/api/commandes/table/:numeroTable/paye', verifierToken, async (req, res) => {
    try {
        const numeroTable = req.params.numeroTable;
        const commandes = await Order.find({ numeroTable: numeroTable, statut: { $ne: 'paye' } });
        
        for (let cmd of commandes) {
            cmd.statut = 'paye';
            await cmd.save();
            io.emit('mise_a_jour_commande', cmd);
        }
        res.json({ success: true, effacees: commandes.length });
    } catch (err) { res.status(500).json({ error: err.message }); }
});


// ========== 5. INITIALISATION DU MENU (SEED) ==========
async function seedDatabase() {
    const count = await Product.countDocuments();
    if (count === 0) {
        await Product.insertMany([
            { id: 1, nom: "Espresso", stock: 200, prix: 2.5, unite: "tasse", categorie: "cafe" },
            { id: 2, nom: "Capucin", stock: 200, prix: 3.0, unite: "tasse", categorie: "cafe" }
        ]);
        console.log("✅ Menu initial injecté !");
    }
}

// ========== 6. DÉMARRAGE DU SERVEUR ==========
mongoose.connection.once('open', () => {
    server.listen(PORT, () => {
        console.log(`🚀 TA'BIA Coffee Shop Online ! Port : ${PORT}`);
        seedDatabase();
    });
});