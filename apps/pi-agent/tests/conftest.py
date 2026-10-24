"""Tests never touch real GPIO: every gpiozero device gets mock pins, even on the Pi."""

from collections.abc import Iterator

import pytest
from gpiozero import Device
from gpiozero.pins.mock import MockFactory, MockPWMPin

# Set at import time so nothing created during collection can reach the default (real) factory.
Device.pin_factory = MockFactory(pin_class=MockPWMPin)


@pytest.fixture(autouse=True)
def mock_gpio() -> Iterator[MockFactory]:
    factory = MockFactory(pin_class=MockPWMPin)
    Device.pin_factory = factory
    yield factory
    factory.reset()
