// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface IERC165 {
  function supportsInterface(bytes4 interfaceId) external view returns (bool);
}

interface IReceiver is IERC165 {
  function onReport(bytes calldata metadata, bytes calldata report) external;
}

interface IERC20 {
  function transfer(address recipient, uint256 amount) external returns (bool);
}

contract ERC20TransferReceiver is IReceiver {
  error InvalidOwner();
  error InvalidForwarder();
  error InvalidSender(address sender, address expected);
  error InvalidSelfCall(address caller);
  error InvalidToken(address token);
  error InvalidRecipient(address recipient);
  error InvalidAmount();
  error TokenTransferFailed();

  event ForwarderUpdated(address indexed forwarder);
  event ERC20TransferExecuted(address indexed token, address indexed recipient, uint256 amount);

  address public owner;
  address public forwarder;

  modifier onlyOwner() {
    if (msg.sender != owner) revert InvalidSender(msg.sender, owner);
    _;
  }

  modifier onlyForwarder() {
    if (msg.sender != forwarder) revert InvalidSender(msg.sender, forwarder);
    _;
  }

  modifier onlySelf() {
    if (msg.sender != address(this)) revert InvalidSelfCall(msg.sender);
    _;
  }

  constructor(address initialOwner, address initialForwarder) {
    if (initialOwner == address(0)) revert InvalidOwner();
    if (initialForwarder == address(0)) revert InvalidForwarder();
    owner = initialOwner;
    forwarder = initialForwarder;
  }

  function setForwarder(address nextForwarder) external onlyOwner {
    if (nextForwarder == address(0)) revert InvalidForwarder();
    forwarder = nextForwarder;
    emit ForwarderUpdated(nextForwarder);
  }

  function onReport(bytes calldata, bytes calldata report) external onlyForwarder {
    (bool ok, bytes memory returndata) = address(this).call(report);
    if (!ok) {
      assembly {
        revert(add(returndata, 0x20), mload(returndata))
      }
    }
  }

  function transferToken(address token, address recipient, uint256 amount) external onlySelf {
    if (token == address(0)) revert InvalidToken(token);
    if (recipient == address(0)) revert InvalidRecipient(recipient);
    if (amount == 0) revert InvalidAmount();

    (bool success, bytes memory returndata) = token.call(
      abi.encodeCall(IERC20.transfer, (recipient, amount))
    );

    if (!success) {
      assembly {
        revert(add(returndata, 0x20), mload(returndata))
      }
    }

    if (returndata.length > 0 && !abi.decode(returndata, (bool))) {
      revert TokenTransferFailed();
    }

    emit ERC20TransferExecuted(token, recipient, amount);
  }

  function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
    return interfaceId == type(IReceiver).interfaceId || interfaceId == type(IERC165).interfaceId;
  }
}
