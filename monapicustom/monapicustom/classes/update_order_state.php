<?php
if (!defined('_PS_VERSION_')) {
    exit;
}

use PrestaShop\PrestaShop\Adapter\SymfonyContainer;

class WebserviceSpecificManagementCustomOrderState implements WebserviceSpecificManagementInterface
{
    /** @var WebserviceOutputBuilder */
    protected $objOutput;

    /** @var WebserviceRequest */
    protected $wsObject;

    /** @var string */
    protected $output = '';

    public function setObjectOutput(WebserviceOutputBuilder $obj)
    {
        $this->objOutput = $obj;

        return $this;
    }

    public function getObjectOutput()
    {
        return $this->objOutput;
    }

    public function setWsObject(WebserviceRequest $obj)
    {
        $this->wsObject = $obj;

        return $this;
    }

    public function getWsObject()
    {
        return $this->wsObject;
    }

    public function setExternalParameters()
    {
    }

    public function manage()
    {
        $method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');

        if ($method !== 'POST') {
            throw new WebserviceException('Method not allowed. Use POST.', [100, 405]);
        }

        $this->bootSymfonyKernel();

        $payload = $this->parseInputXml();
        $result = $this->handlePost($payload);
        $this->output = $this->buildSuccessResponse($result);

        return true;
    }

    public function getContent()
    {
        return $this->objOutput->getObjectRender()->overrideContent($this->output);
    }

    private function handlePost(array $payload)
    {
        $orderId = (int) ($payload['id_order'] ?? 0);
        $stateId = (int) ($payload['id_order_state'] ?? 0);
        $employeeId = (int) ($payload['id_employee'] ?? 0);
        $effectiveDate = $this->normalizeImportDate($payload['date'] ?? '');

        if ($orderId <= 0) {
            throw new WebserviceException('id_order obligatoire.', [101, 400]);
        }

        if (!in_array($stateId, [5, 6], true)) {
            throw new WebserviceException('id_order_state autorise: 5 (livre) ou 6 (annule).', [102, 400]);
        }

        $order = new Order($orderId);
        if (!Validate::isLoadedObject($order)) {
            throw new WebserviceException('Commande introuvable.', [103, 404]);
        }

        if ((int) $order->current_state === $stateId) {
            return [
                'id_order' => (int) $order->id,
                'previous_state' => (int) $order->current_state,
                'new_state' => (int) $order->current_state,
                'changed' => 0,
                'history_id' => 0,
                'delivery_date' => (string) $order->delivery_date,
                'invoice_number' => (int) $order->invoice_number,
                'id_employee' => 0,
                'effective_date' => $effectiveDate !== null ? $effectiveDate : '',
            ];
        }

        $history = new OrderHistory();
        $history->id_order = (int) $order->id;
        $employee = $this->resolveContextEmployee($employeeId);
        if ($employee !== null) {
            Context::getContext()->employee = $employee;
            $history->id_employee = (int) $employee->id;
        } else {
            $history->id_employee = 0;
        }

        $useExistingPayment = !$order->hasInvoice();
        $previousState = (int) $order->current_state;
        $lastStockMovementId = $this->getLastStockMovementId($order->id);

        $history->changeIdOrderState($stateId, $order, $useExistingPayment);

        if ($effectiveDate !== null) {
            $history->date_add = $effectiveDate;
        }

        $historyAdded = $effectiveDate !== null
            ? $history->addWithemail(false)
            : $history->addWithemail();

        if (!$historyAdded) {
            throw new WebserviceException('Impossible d ajouter l historique de commande.', [104, 500]);
        }

        if ($effectiveDate !== null) {
            $this->applyImportedDateToOrderHistory($history->id, $effectiveDate);
            $this->applyImportedDateToStockMovements($order->id, $lastStockMovementId, $effectiveDate);
            $this->applyImportedDateToOrderDelivery($order, $stateId, $effectiveDate);
        }

        $updatedOrder = new Order((int) $order->id);

        return [
            'id_order' => (int) $updatedOrder->id,
            'previous_state' => $previousState,
            'new_state' => (int) $updatedOrder->current_state,
            'changed' => 1,
            'history_id' => (int) $history->id,
            'id_employee' => $employee !== null ? (int) $employee->id : 0,
            'effective_date' => $effectiveDate !== null ? $effectiveDate : '',
            'delivery_date' => (string) $updatedOrder->delivery_date,
            'invoice_number' => (int) $updatedOrder->invoice_number,
        ];
    }

    private function parseInputXml()
    {
        $raw = trim((string) file_get_contents('php://input'));

        if ($raw === '') {
            throw new WebserviceException('Body XML vide.', [105, 400]);
        }

        libxml_use_internal_errors(true);
        $xml = simplexml_load_string($raw);

        if (!$xml) {
            throw new WebserviceException('XML invalide.', [106, 400]);
        }

        $node = null;

        if (isset($xml->manual_order_state)) {
            $node = $xml->manual_order_state;
        } elseif ($xml->getName() === 'manual_order_state') {
            $node = $xml;
        }

        if (!$node) {
            throw new WebserviceException('Balise <manual_order_state> introuvable.', [107, 400]);
        }

        return [
            'id_order' => (string) $node->id_order,
            'id_order_state' => (string) $node->id_order_state,
            'id_employee' => (string) $node->id_employee,
            'date' => (string) ($node->date ?: $node->movement_date),
        ];
    }

    private function resolveContextEmployee($employeeId)
    {
        $employeeId = (int) $employeeId;

        if ($employeeId > 0) {
            $employee = new Employee($employeeId);
            if (Validate::isLoadedObject($employee)) {
                return $employee;
            }
        }

        $fallbackEmployeeId = (int) Db::getInstance()->getValue(
            'SELECT `id_employee` FROM `' . _DB_PREFIX_ . 'employee` ORDER BY `id_employee` ASC'
        );

        if ($fallbackEmployeeId > 0) {
            $employee = new Employee($fallbackEmployeeId);
            if (Validate::isLoadedObject($employee)) {
                return $employee;
            }
        }

        return null;
    }

    private function bootSymfonyKernel()
    {
        global $kernel;

        if (SymfonyContainer::getInstance() !== null) {
            return;
        }

        if (!class_exists('AppKernel', false)) {
            require_once _PS_ROOT_DIR_ . '/app/AppKernel.php';
        }

        if (!isset($kernel) || !($kernel instanceof AppKernel)) {
            $kernel = new AppKernel(_PS_ENV_, _PS_MODE_DEV_);
        }

        if (method_exists($kernel, 'isBooted')) {
            if (!$kernel->isBooted()) {
                $kernel->boot();
            }
        } else {
            $kernel->boot();
        }

        Context::getContext()->container = $kernel->getContainer();
        SymfonyContainer::resetStaticCache();
        SymfonyContainer::getInstance();
    }

    private function buildSuccessResponse(array $data)
    {
        return '<manual_order_state>'
            . '<success>1</success>'
            . '<id_order>' . (int) $data['id_order'] . '</id_order>'
            . '<previous_state>' . (int) $data['previous_state'] . '</previous_state>'
            . '<new_state>' . (int) $data['new_state'] . '</new_state>'
            . '<changed>' . (int) $data['changed'] . '</changed>'
            . '<history_id>' . (int) $data['history_id'] . '</history_id>'
            . '<id_employee>' . (int) $data['id_employee'] . '</id_employee>'
            . '<effective_date>' . htmlspecialchars((string) $data['effective_date']) . '</effective_date>'
            . '<delivery_date>' . htmlspecialchars((string) $data['delivery_date']) . '</delivery_date>'
            . '<invoice_number>' . (int) $data['invoice_number'] . '</invoice_number>'
            . '</manual_order_state>';
    }

    private function normalizeImportDate($value)
    {
        $value = trim((string) $value);

        if ($value === '') {
            return null;
        }

        if (preg_match('/^\d{4}-\d{2}-\d{2}( \d{2}:\d{2}:\d{2})?$/', $value)) {
            return strlen($value) === 10 ? $value . ' 00:00:00' : $value;
        }

        if (preg_match('/^(\d{2})\/(\d{2})\/(\d{4})( \d{2}:\d{2}:\d{2})?$/', $value, $matches)) {
            $timePart = !empty($matches[4]) ? $matches[4] : ' 00:00:00';

            return $matches[3] . '-' . $matches[2] . '-' . $matches[1] . $timePart;
        }

        throw new WebserviceException(
            'date invalide. Formats acceptes: YYYY-MM-DD HH:MM:SS, YYYY-MM-DD ou DD/MM/YYYY',
            [108, 400]
        );
    }

    private function getLastStockMovementId($orderId)
    {
        return (int) Db::getInstance()->getValue(
            'SELECT MAX(`id_stock_mvt`) FROM `' . _DB_PREFIX_ . 'stock_mvt` WHERE `id_order` = ' . (int) $orderId
        );
    }

    private function applyImportedDateToOrderHistory($historyId, $effectiveDate)
    {
        if ((int) $historyId <= 0) {
            return;
        }

        Db::getInstance()->update(
            'order_history',
            ['date_add' => pSQL($effectiveDate)],
            'id_order_history = ' . (int) $historyId
        );
    }

    private function applyImportedDateToStockMovements($orderId, $lastStockMovementId, $effectiveDate)
    {
        Db::getInstance()->update(
            'stock_mvt',
            ['date_add' => pSQL($effectiveDate)],
            'id_order = ' . (int) $orderId . ' AND id_stock_mvt > ' . (int) $lastStockMovementId
        );
    }

    private function applyImportedDateToOrderDelivery(Order $order, $stateId, $effectiveDate)
    {
        $state = new OrderState((int) $stateId);
        if (!Validate::isLoadedObject($state) || !(int) $state->delivery) {
            return;
        }

        $order->delivery_date = $effectiveDate;
        $order->update();
    }
}