package com.aveniq.kitchen.printing;
import org.junit.Test;
import static org.junit.Assert.*;
public class LanDestinationTest {
 @Test public void privateLiteralsOnlyAndPortsBounded(){for(String ip:new String[]{"10.0.2.2","172.16.1.10","192.168.1.30"})assertTrue(ip,LanDestination.isPrivateLiteral(ip));for(String ip:new String[]{"127.0.0.1","169.254.169.254","8.8.8.8","192.168.001.1","http://192.168.1.1","printer.local","10.0.0.255","::1","0.0.0.0"})assertFalse(ip,LanDestination.isPrivateLiteral(ip));}
 @Test public void connectedSubnetExcludesNetworkAndBroadcast(){assertTrue(LanDestination.inSubnet("192.168.1.30","192.168.1.20",24));assertFalse(LanDestination.inSubnet("192.168.2.30","192.168.1.20",24));assertFalse(LanDestination.inSubnet("192.168.1.0","192.168.1.20",24));assertFalse(LanDestination.inSubnet("192.168.1.255","192.168.1.20",24));assertFalse(LanDestination.inSubnet("192.168.1.30","192.168.1.20",0));}
}
