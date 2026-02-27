// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title PaymentRouter
 * @notice Receives USDC from payers, deducts a protocol fee, and forwards
 *         the net amount to the merchant. Deployed on Arc Testnet.
 *
 * @dev The caller must have approved this contract to spend `grossAmount` of
 *      USDC before calling `pay()`. The smart account orchestrator handles
 *      the approval as part of the same UserOperation batch.
 */
contract PaymentRouter is Ownable {
    IERC20 public immutable usdc;
    address public feeRecipient;
    uint256 public feeBps; // e.g. 50 = 0.5%

    event PaymentExecuted(
        address indexed payer,
        address indexed recipient,
        uint256 netAmount,
        uint256 fee,
        bytes32 indexed paymentRef
    );

    event SplitPaymentExecuted(
        address indexed payer,
        address[] recipients,
        uint256[] shares,
        uint256 totalNet,
        uint256 fee,
        bytes32 indexed paymentRef
    );

    event FeeUpdated(uint256 oldFeeBps, uint256 newFeeBps);
    event FeeRecipientUpdated(address oldRecipient, address newRecipient);

    error ZeroAddress();
    error FeeTooHigh();
    error ZeroAmount();
    error LengthMismatch();
    error BpsMustSum10000();

    constructor(
        address _usdc,
        address _feeRecipient,
        uint256 _feeBps
    ) Ownable(msg.sender) {
        if (_usdc == address(0) || _feeRecipient == address(0)) revert ZeroAddress();
        if (_feeBps > 1000) revert FeeTooHigh(); // max 10%
        usdc = IERC20(_usdc);
        feeRecipient = _feeRecipient;
        feeBps = _feeBps;
    }

    /**
     * @notice Pay a merchant in USDC. A protocol fee is deducted from grossAmount.
     * @param recipient   Merchant's Arc wallet address
     * @param grossAmount Total USDC to pull from msg.sender (in USDC base units, 6 decimals)
     * @param paymentRef  Arbitrary reference bytes32 (e.g. keccak256 of invoice ID)
     */
    function pay(
        address recipient,
        uint256 grossAmount,
        bytes32 paymentRef
    ) external {
        if (recipient == address(0)) revert ZeroAddress();
        if (grossAmount == 0) revert ZeroAmount();

        uint256 fee = (grossAmount * feeBps) / 10_000;
        uint256 netAmount = grossAmount - fee;

        usdc.transferFrom(msg.sender, recipient, netAmount);
        if (fee > 0) {
            usdc.transferFrom(msg.sender, feeRecipient, fee);
        }

        emit PaymentExecuted(msg.sender, recipient, netAmount, fee, paymentRef);
    }

    /**
     * @notice Split a payment among multiple recipients according to basis-point shares.
     * @param recipients  Array of recipient addresses
     * @param bps         Each recipient's share in bps (must sum to 10000)
     * @param grossAmount Total USDC to pull from msg.sender
     * @param paymentRef  Arbitrary reference bytes32
     */
    function splitPay(
        address[] calldata recipients,
        uint256[] calldata bps,
        uint256 grossAmount,
        bytes32 paymentRef
    ) external {
        if (recipients.length == 0 || recipients.length != bps.length) revert LengthMismatch();
        if (grossAmount == 0) revert ZeroAmount();

        uint256 total;
        for (uint256 i; i < bps.length; ) {
            total += bps[i];
            unchecked { ++i; }
        }
        if (total != 10_000) revert BpsMustSum10000();

        uint256 fee = (grossAmount * feeBps) / 10_000;
        uint256 net = grossAmount - fee;

        if (fee > 0) {
            usdc.transferFrom(msg.sender, feeRecipient, fee);
        }

        uint256[] memory shares = new uint256[](recipients.length);
        for (uint256 i; i < recipients.length; ) {
            shares[i] = (net * bps[i]) / 10_000;
            usdc.transferFrom(msg.sender, recipients[i], shares[i]);
            unchecked { ++i; }
        }

        emit SplitPaymentExecuted(msg.sender, recipients, shares, net, fee, paymentRef);
    }

    /**
     * @notice Update the protocol fee. Max 10% (1000 bps).
     */
    function updateFeeBps(uint256 _feeBps) external onlyOwner {
        if (_feeBps > 1000) revert FeeTooHigh();
        emit FeeUpdated(feeBps, _feeBps);
        feeBps = _feeBps;
    }

    /**
     * @notice Update the fee recipient address.
     */
    function updateFeeRecipient(address _feeRecipient) external onlyOwner {
        if (_feeRecipient == address(0)) revert ZeroAddress();
        emit FeeRecipientUpdated(feeRecipient, _feeRecipient);
        feeRecipient = _feeRecipient;
    }
}
