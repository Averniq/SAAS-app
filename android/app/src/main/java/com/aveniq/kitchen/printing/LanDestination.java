package com.aveniq.kitchen.printing;
import android.content.Context;
import android.net.ConnectivityManager;
import android.net.LinkAddress;
import android.net.LinkProperties;
import android.net.Network;
import android.net.NetworkCapabilities;
import java.net.InetAddress;
import java.net.Inet4Address;
import java.io.IOException;
/** Only server-approved literal destinations on the active local network are usable. */
public final class LanDestination {
 public static final class Approved {final InetAddress address;final int port;final Network network;final long revision;private Approved(InetAddress address,int port,Network network,long revision){this.address=address;this.port=port;this.network=network;this.revision=revision;}}
 private LanDestination(){}
 private static long numeric(String ip){if(ip==null||!ip.matches("(0|[1-9][0-9]{0,2})(\\.(0|[1-9][0-9]{0,2})){3}"))return -1;long value=0;for(String part:ip.split("\\.")){int octet=Integer.parseInt(part);if(octet>255)return -1;value=value*256+octet;}return value;}
 public static boolean isPrivateLiteral(String ip){long value=numeric(ip);if(value<0)return false;long a=value>>>24,b=(value>>>16)&255,last=value&255;return (a==10||a==172&&b>=16&&b<=31||a==192&&b==168)&&last!=0&&last!=255;}
 public static boolean inSubnet(String ip,String local,int prefix){long remote=numeric(ip),host=numeric(local);if(remote<0||host<0||prefix<1||prefix>30)return false;long mask=(0xffffffffL<<(32-prefix))&0xffffffffL,network=host&mask,broadcast=network|(~mask&0xffffffffL);return (remote&mask)==network&&remote!=network&&remote!=broadcast;}
 public static Approved approve(Context context,String ip,int port,long revision) throws IOException {
  if(!isPrivateLiteral(ip)||port<1024||port>65535||revision<1)throw new IOException("DESTINATION_DENIED");ConnectivityManager manager=(ConnectivityManager)context.getSystemService(Context.CONNECTIVITY_SERVICE);Network network=manager.getActiveNetwork();NetworkCapabilities capabilities=network==null?null:manager.getNetworkCapabilities(network);if(capabilities==null||capabilities.hasTransport(NetworkCapabilities.TRANSPORT_VPN)||!(capabilities.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)||capabilities.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET)))throw new IOException("LOCAL_NETWORK_REQUIRED");LinkProperties properties=manager.getLinkProperties(network);boolean same=false;if(properties!=null)for(LinkAddress address:properties.getLinkAddresses())if(address.getAddress() instanceof Inet4Address&&inSubnet(ip,address.getAddress().getHostAddress(),address.getPrefixLength()))same=true;if(!same)throw new IOException("PRINTER_NOT_ON_ACTIVE_SUBNET");String[] parts=ip.split("\\.");byte[] bytes=new byte[4];for(int n=0;n<4;n++)bytes[n]=(byte)Integer.parseInt(parts[n]);return new Approved(InetAddress.getByAddress(bytes),port,network,revision);
 }
}
