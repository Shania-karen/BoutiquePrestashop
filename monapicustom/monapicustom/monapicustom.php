<?php
if (!defined('_PS_VERSION_')) {
    exit;
}

require_once __DIR__ . '/classes/update_order_state.php';

class MonApiCustom extends Module
{
    public function __construct()
    {
        $this->name = 'monapicustom';
        $this->tab = 'administration';
        $this->version = '1.0.0';
        $this->author = 'Mahery';
        $this->need_instance = 0;

        parent::__construct();

        $this->displayName = $this->l('API Sur-mesure - Statut Commande');
        $this->description = $this->l('Ajoute un endpoint API natif pour changer les statuts avec logique métier (stock, email).');
    }

    public function install()
    {
        // On installe le module et on s'accroche au hook de l'API
        return parent::install() && $this->registerHook('addWebserviceResources');
    }

    public function uninstall()
    {
        return parent::uninstall();
    }

    /**
     * Déclaration de la nouvelle ressource API
     */
    public function hookAddWebserviceResources($params)
    {
        return [
            'custom_order_state' => [
                'description' => 'Mise à jour d\'un statut de commande avec exécution de la logique métier',
                // specific_management indique à PS qu'on gère la requête avec notre propre classe
                'specific_management' => true, 
            ],
        ];
    }
}