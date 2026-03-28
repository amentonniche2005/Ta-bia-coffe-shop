// ========== CONFIGURATION API ==========
const API_URL = window.location.origin;

console.log('🌐 API URL:', API_URL);

// ========== GESTION DES CODES DE TABLE ==========
async function loadTableNumbersData() {
    try {
        const response = await fetch(`${API_URL}/api/numbers`);
        const data = await response.json();
        console.log('✅ Données des tables chargées:', data);
        return data;
    } catch (error) {
        console.error('❌ Erreur chargement tables:', error);
        return [];
    }
}

async function verifyTableCode(numeroTable, code) {
    try {
        const response = await fetch(`${API_URL}/api/verify-code/${numeroTable}/${code}`);
        const data = await response.json();
        return data.valid;
    } catch (error) {
        console.error('Erreur vérification:', error);
        return false;
    }
}

async function getTableCode(numeroTable) {
    try {
        const response = await fetch(`${API_URL}/api/number/${numeroTable}`);
        const data = await response.json();
        return data.id;
    } catch (error) {
        console.error('Erreur:', error);
        return null;
    }
}

async function updateTableCode(numeroTable, newCode) {
    try {
        const response = await fetch(`${API_URL}/api/number/${numeroTable}/refresh`, {
            method: 'POST'
        });
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Erreur:', error);
        return null;
    }
}

// ========== PRODUITS ==========
const produits = [
    // ========== CAFÉS ==========
    { 
        id: 1, 
        nom: "Espresso", 
        prix: 2.500, 
        categorie: "cafe", 
        description: "Café italien intense et corsé - 100% Arabica", 
        image: "https://images.unsplash.com/photo-1510707577719-ae7c14805e3a?w=400&h=300&fit=crop"
    },
    { 
        id: 2, 
        nom: "Cappuccino", 
        prix: 3.800, 
        categorie: "cafe", 
        description: "Café onctueux avec mousse de lait et cacao", 
        image: "https://images.unsplash.com/photo-1572442388796-11668a67e53d?w=400&h=300&fit=crop"
    },
    { 
        id: 3, 
        nom: "Latte Macchiato", 
        prix: 4.200, 
        categorie: "cafe", 
        description: "Lait chaud, café expresso et mousse de lait", 
        image: "https://images.unsplash.com/photo-1485808191679-5f86510681a2?w=400&h=300&fit=crop"
    },
    { 
        id: 4, 
        nom: "Americano", 
        prix: 2.200, 
        categorie: "cafe", 
        description: "Café américain léger et aromatique", 
        image: "https://assets.beanbox.com/blog_images/AB7ud4YSE6nmOX0iGlgA.jpeg"
    },
    { 
        id: 5, 
        nom: "Mocha", 
        prix: 4.500, 
        categorie: "cafe", 
        description: "Café au chocolat avec crème fouettée", 
        image: "https://ichef.bbci.co.uk/food/ic/food_16x9_1600/recipes/the_perfect_mocha_coffee_29100_16x9.jpg"
    },
    { 
        id: 6, 
        nom: "Caramel Macchiato", 
        prix: 4.800, 
        categorie: "cafe", 
        description: "Café à la vanille avec caramel", 
        image: "https://images.ctfassets.net/v601h1fyjgba/6NnFSs8SkNhTmEVMOqFqSZ/022db82e52a7a81fe3196877ebc0ef19/Caramel_Macchiato.jpg"
    },

    // ========== BOISSONS FRAÎCHES ==========
    { 
        id: 7, 
        nom: "Jus d'orange", 
        prix: 4.500, 
        categorie: "boissons", 
        description: "Jus d'orange frais pressé - 100% pur fruit", 
        image: "https://numorning.com/cdn/shop/articles/Jus_d_orange_a35f1fe3-d0a4-4b80-9141-c1b6240fa6f1.jpg?v=1747657704"
    },
    { 
        id: 8, 
        nom: "Citronnade", 
        prix: 3.500, 
        categorie: "boissons", 
        description: "Citron pressé maison, menthe fraîche", 
        image: "https://img.cuisineaz.com/660x495/2020/06/22/i154380-citronnade.jpeg"
    },
    { 
        id: 9, 
        nom: "Smoothie Fruits Rouges", 
        prix: 5.500, 
        categorie: "boissons", 
        description: "Fraise, framboise, myrtille - Lait végétal", 
        image: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSrSpAnVcZ9iqxbYEGMQmZUHvMKFpqa66L-HQ&s"
    },
    { 
        id: 10, 
        nom: "Smoothie Mangue", 
        prix: 5.500, 
        categorie: "boissons", 
        description: "Mangue, banane, lait de coco", 
        image: "https://wordpress.potagercity.fr/wp-content/uploads/2019/06/RECETTE_smoothie_mangue_poire_banane-1.jpg"
    },
    { 
        id: 11, 
        nom: "Ice Tea ", 
        prix: 3.500, 
        categorie: "boissons", 
        description: "Thé glacé - Maison", 
        image: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTMZ5YFZpeeSRo2OvrnM7oyB10Zm0Kj0dISjA&s"
    },
    { 
        id: 12, 
        nom: "Milkshake Chocolat", 
        prix: 5.000, 
        categorie: "boissons", 
        description: "Lait frappé au chocolat, chantilly", 
        image: "https://cbimg.cookinbreak.com/recettes/BFQBaw2UEhJO.webp "
    },

    // ========== SANDWICHS ==========
    { 
        id: 13, 
        nom: "Hamburger", 
        prix: 8.500, 
        categorie: "sandwish", 
        description: "Steak haché 180g, salade, tomate, oignon, sauce maison", 
        image: "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=400&h=300&fit=crop"
    },
    { 
        id: 14, 
        nom: "Sandwich Mixte", 
        prix: 6.500, 
        categorie: "sandwish", 
        description: "Jambon, fromage, laitue, mayonnaise", 
        image: "https://png.pngtree.com/thumb_back/fw800/background/20251001/pngtree-ham-and-lettuce-sandwich-on-purple-background-image_19748617.webp"
    },
    { 
        id: 15, 
        nom: "Sandwich Thon", 
        prix: 6.000, 
        categorie: "sandwish", 
        description: "Thon, œuf, laitue, tomate", 
        image: "https://img.cuisineaz.com/660x495/2020/03/05/i152273-sandwich-thon-oeuf.jpeg"
    },
    { 
        id: 16, 
        nom: "Panini Poulet", 
        prix: 7.500, 
        categorie: "sandwish", 
        description: "Poulet grillé, mozzarella, pesto", 
        image: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRkGKY1kUFF8j1BOEgxSSo_X61Iz-FmU9ORbQ&s"
    },
    { 
        id: 17, 
        nom: "Wrap Caesar", 
        prix: 7.800, 
        categorie: "sandwish", 
        description: "Poulet, salade, parmesan, sauce Caesar", 
        image: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSmo2NIZJdfXkkBnCVOrPIMxiyX5SE7FfXQ0g&s"
    },
    { 
        id: 18, 
        nom: "Club Sandwich", 
        prix: 8.000, 
        categorie: "sandwish", 
        description: "Pain de mie, poulet, bacon, salade, tomate", 
        image: "https://oliveoilsfromspain.org/wp-content/uploads/2024/01/Club-sandwich.jpg.webp"
    },

    // ========== PETIT DÉJEUNER ==========
    { 
        id: 19, 
        nom: "Croissant", 
        prix: 2.500, 
        categorie: "pd", 
        description: "Croissant feuilleté pur beurre - Fait maison", 
        image: "https://fieldandfire.com/wp-content/uploads/2020/03/ButterCroissant-scaled.jpg"
    },
    { 
        id: 20, 
        nom: "Pain au Chocolat", 
        prix: 2.800, 
        categorie: "pd", 
        description: "Viennoiserie au chocolat - Pur beurre", 
        image: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRNw7XE1AEV9QC8xtfz_kFp5FlGYXZWpV0WyA&s"
    },
    { 
        id: 21, 
        nom: "Pain aux Raisins", 
        prix: 2.800, 
        categorie: "pd", 
        description: "Viennoiserie aux raisins et crème pâtissière", 
        image: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQE7LrRJrwDM6MgwFNH8Ph5wCbIZHqGX7ynhA&s"
    },
    { 
        id: 22, 
        nom: "Brioche", 
        prix: 3.000, 
        categorie: "pd", 
        description: "Brioche feuilletée - Spécialité maison", 
        image: "https://assets.afcdn.com/recipe/20250408/159512_w1024h576c1cx1893cy1900cxt0cyt0cxb4608cyb3456.jpeg"
    },
    { 
        id: 23, 
        nom: "Fondant au Chocolat", 
        prix: 6.000, 
        categorie: "pd", 
        description: "Cœur coulant au chocolat noir - Maison", 
        image: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRzM7IMwCLrEUHy3hWUr0qJy0t66ZqWsgUozA&s"
    },
    { 
        id: 24, 
        nom: "Tiramisu", 
        prix: 5.500, 
        categorie: "pd", 
        description: "Dessert italien au café et mascarpone", 
        image: "https://ichef.bbc.co.uk/ace/standard/1600/food/recipes/tiramisu_affogato_41821_16x9.jpg.webp"
    },

    // ========== PLATS CHAUDS ==========
    { 
        id: 25, 
        nom: "Pasta Carbonara", 
        prix: 12.900, 
        categorie: "plat", 
        description: "Pâtes fraîches, crème, lardons, parmesan", 
        image: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQT4bOSfJU-gWQybKWsoJAv45gImZkT_qLnQw&s"
    },
    { 
        id: 26, 
        nom: "Pasta Bolognaise", 
        prix: 12.900, 
        categorie: "plat", 
        description: "Pâtes, sauce bolognaise maison, parmesan", 
        image: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSSQtckTf61IhNq2Isx9qeN9zNz9hJOimJ26w&s"
    },
    { 
        id: 27, 
        nom: "Ejja Merguez", 
        prix: 10.500, 
        categorie: "plat", 
        description: "Œufs, merguez, pommes de terre sautées", 
        image: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQBCJfRabJ5Ze8fDAEVC-xh8NBL7z83zxqWSQ&s"
    },
    { 
        id: 28, 
        nom: "Escalope Panée", 
        prix: 11.900, 
        categorie: "plat", 
        description: "Escalope de poulet panée, frites maison", 
        image: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcT-K0EdmQCqCutD1FLMn6vtrrCnfddQb2BcEg&s"
    },
    { 
        id: 29, 
        nom: "Mechwi", 
        prix: 13.500, 
        categorie: "plat", 
        description: "Viande grillée, salade, frites, sauce", 
        image: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQWg_nS6G8fo6NBZ49JbmJQmPeiyCfwyU_QXw&s"
    },
    { 
        id: 30, 
        nom: "Salade César", 
        prix: 9.900, 
        categorie: "plat", 
        description: "Poulet grillé, salade, parmesan, croûtons", 
        image: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTSwgb7gCfAyCUUZQD_mxq6Wos6kZg2r6-Wlw&s"
    }
];

// ========== FONCTIONS API ==========
let commandesCache = [];
let socket = null;
let listeners = [];

function initSocket() {
    socket = io();
    
    socket.on('connect', () => {
        console.log('🔌 Connecté au serveur');
    });
    
    socket.on('commandes_initiales', (commandes) => {
        commandesCache = commandes;
        notifyListeners();
    });
    
    socket.on('nouvelle_commande', (commande) => {
        commandesCache.push(commande);
        notifyListeners();
    });
    
    socket.on('mise_a_jour_commande', (commande) => {
        const index = commandesCache.findIndex(c => c.id === commande.id);
        if (index !== -1) {
            commandesCache[index] = commande;
            notifyListeners();
        }
    });
    
    socket.on('suppression_commande', (id) => {
        commandesCache = commandesCache.filter(c => c.id != id);
        notifyListeners();
    });
}

function getToutesCommandes() {
    return commandesCache;
}

function getCommandesClient(clientId) {
    return commandesCache.filter(c => c.clientId === clientId);
}

async function ajouterCommande(panier, type = "client", numeroTable = null) {
    const clientId = localStorage.getItem('clientId');
    
    const response = await fetch(`${API_URL}/api/commandes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            articles: panier,
            numeroTable: numeroTable,
            clientId: clientId
        })
    });
    
    if (!response.ok) {
        throw new Error('Erreur lors de la création de la commande');
    }
    
    return await response.json();
}

async function changerStatutCommande(commandeId, nouveauStatut) {
    const response = await fetch(`${API_URL}/api/commandes/${commandeId}/statut`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ statut: nouveauStatut })
    });
    
    if (!response.ok) {
        throw new Error('Erreur lors du changement de statut');
    }
    
    return await response.json();
}

async function supprimerCommande(commandeId) {
    const response = await fetch(`${API_URL}/api/commandes/${commandeId}`, {
        method: 'DELETE'
    });
    
    if (!response.ok) {
        throw new Error('Erreur lors de la suppression');
    }
    
    return await response.json();
}

async function payerCommande(commandeId) {
    const response = await fetch(`${API_URL}/api/commandes/${commandeId}/payer`, {
        method: 'PUT'
    });
    
    if (!response.ok) {
        throw new Error('Erreur lors du paiement');
    }
    
    return await response.json();
}

async function getStats() {
    const response = await fetch(`${API_URL}/api/stats`);
    return await response.json();
}

function ecouterMisesAJour(callback) {
    listeners.push(callback);
}

function notifyListeners() {
    listeners.forEach(callback => callback());
}

// Exporter les fonctions pour les autres fichiers
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { 
        produits, 
        verifyTableCode, 
        getTableCode, 
        updateTableCode, 
        loadTableNumbersData,
        initSocket,
        ajouterCommande,
        changerStatutCommande,
        supprimerCommande,
        payerCommande,
        getStats,
        getToutesCommandes,
        getCommandesClient,
        ecouterMisesAJour
    };
}

// Initialisation
initSocket();
loadTableNumbersData().then(data => {
    if (data && data.length > 0) {
        window.tableNumbersData = data;
        console.log('✅ Données tables chargées:', data.length);
    }
});

console.log("✅ data.js chargé - Menu complet avec 30 produits");